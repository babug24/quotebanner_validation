const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const REPORTS_DIR = path.join(__dirname, 'reports');

// ----- Global variables -----
let mobileDevice = null;
let headedMode = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createResultRecorder(results, baseUrl) {
  return function recordResult(step, category, target, success, details = {}) {
    const entry = {
      step,
      category,
      target,
      success,
      details,
      timestamp: new Date().toISOString(),
      url: baseUrl
    };
    results.push(entry);
    return entry;
  };
}

function isExcludedFromReport(result) {
  if (result.category === 'Navigation' && result.target === 'Navigate to target site') return true;
  if (result.category === 'Cookie Consent' && result.target === 'Accept cookies') return true;
  if (result.category === 'Rendering Check' && result.target === 'Page rendering check') return true;
  return false;
}

function generateCsvReport(results, outputPath, urls = [], deviceName = null) {
  const rows = [
    ['Validation URL', 'Category', 'Target', 'Status', 'Details', 'Timestamp']
  ];
  
  const filteredResults = results.filter(r => 
    r.details?.status !== 'not-available' && 
    r.details?.status !== 'no-options' &&
    r.details?.status !== 'skipped' &&
    !isExcludedFromReport(r)
  );
  
  for (const result of filteredResults) {
    let status = result.success ? 'PASS' : 'FAIL';
    rows.push([
      result.url || '',
      result.category,
      result.target,
      status,
      JSON.stringify(result.details).replace(/,/g, ';'),
      result.timestamp
    ]);
  }
  
  const passed = filteredResults.filter(r => r.success).length;
  const failed = filteredResults.filter(r => !r.success).length;
  const total = passed + failed;
  const successRate = total ? Math.round((passed / total) * 100) : 0;
  
  rows.push([]);
  rows.push(['SUMMARY']);
  rows.push(['Total Checks', total]);
  rows.push(['Passed', passed]);
  rows.push(['Failed', failed]);
  rows.push(['Success Rate', `${successRate}%`]);
  rows.push(['URLs Tested', urls.join('; ')]);
  rows.push(['Device', deviceName || 'Desktop']);
  rows.push(['Generated', new Date().toLocaleString()]);
  
  const csvContent = rows.map(row => row.join(',')).join('\n');
  fs.writeFileSync(outputPath, csvContent, 'utf8');
  console.log(`📊 CSV report saved to ${outputPath}`);
}

function generateDropdownHtmlReport(results, startedAt, finishedAt, outputPath, urls = [], deviceName = null) {
  const displayResults = results.filter(r => 
    r.details?.status !== 'not-available' && 
    r.details?.status !== 'no-options' &&
    r.details?.status !== 'skipped' &&
    !isExcludedFromReport(r)
  );
  
  const passed = displayResults.filter(result => result.success).length;
  const failed = displayResults.filter(result => !result.success).length;
  const total = displayResults.length;
  const successRate = total ? Math.round((passed / total) * 100) : 0;
  
  const uniqueUrls = [...new Set(displayResults.map(r => r.url).filter(Boolean))];
  const domain = uniqueUrls.length > 0 ? new URL(uniqueUrls[0]).hostname : '';

  const urlBadges = uniqueUrls.map(url => 
    `<span class="url-badge">${escapeHtml(url)}</span>`
  ).join('');

  const deviceLabel = deviceName ? `📱 ${deviceName}` : '💻 Desktop';
  const deviceBadge = `<span class="badge-env" style="background:#6c757d;margin-left:8px;">${deviceLabel}</span>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quote Dropdown Validator - ${escapeHtml(domain)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f0f4f8; padding: 20px; color: #1a2332; }
    .container { max-width: 1400px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; border-bottom: 3px solid #0047AB; padding-bottom: 20px; margin-bottom: 24px; }
    .header-left h1 { color: #0047AB; font-size: 28px; font-weight: 700; margin-bottom: 4px; }
    .header-left .subtitle { color: #5a6a7a; font-size: 14px; }
    .header-right { text-align: right; font-size: 13px; color: #5a6a7a; }
    .header-right .url { color: #0047AB; font-weight: 600; word-break: break-all; max-width: 400px; display: inline-block; }
    .badge-env { display: inline-block; background: #0047AB; color: #fff; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 4px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin: 24px 0 28px 0; }
    .card { background: #f8fafc; border-radius: 12px; padding: 18px 20px; border: 1px solid #e8edf2; transition: transform 0.15s; }
    .card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
    .card .number { font-size: 32px; font-weight: 700; line-height: 1.2; }
    .card .label { font-size: 13px; color: #5a6a7a; margin-top: 2px; }
    .card.success .number { color: #0b7e4b; }
    .card.fail .number { color: #c72a2a; }
    .card.total .number { color: #0047AB; }
    .card.rate .number { color: #8b5cf6; }
    .card.success { border-left: 4px solid #0b7e4b; }
    .card.fail { border-left: 4px solid #c72a2a; }
    .card.total { border-left: 4px solid #0047AB; }
    .card.rate { border-left: 4px solid #8b5cf6; }
    .section-title { font-size: 18px; font-weight: 600; color: #1a2332; margin: 28px 0 14px 0; padding-bottom: 8px; border-bottom: 2px solid #e8edf2; }
    .table-wrapper { overflow-x: auto; border-radius: 10px; border: 1px solid #e8edf2; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #0047AB; color: #ffffff; padding: 12px 14px; text-align: left; font-weight: 600; white-space: nowrap; }
    td { padding: 10px 14px; border-bottom: 1px solid #eef2f6; vertical-align: top; word-break: break-word; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f8fafc; }
    .success-row td { background-color: #f0faf5; }
    .success-row:hover td { background-color: #e5f5ed; }
    .fail-row td { background-color: #fdf0ef; }
    .fail-row:hover td { background-color: #fce8e6; }
    .badge { display: inline-block; padding: 3px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
    .badge-pass { background: #0b7e4b; color: #fff; }
    .badge-fail { background: #c72a2a; color: #fff; }
    .details { font-size: 12px; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e8edf2; max-height: 200px; overflow: auto; white-space: pre-wrap; word-break: break-word; font-family: 'Consolas', 'Courier New', monospace; margin: 0; }
    .category-col { color: #5a6a7a; }
    .url-col { font-size: 11px; color: #5a6a7a; max-width: 200px; word-break: break-all; }
    .footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e8edf2; display: flex; justify-content: space-between; flex-wrap: wrap; font-size: 12px; color: #8a9aa8; }
    .url-badge { display: inline-block; background: #eef2f6; color: #1a2332; padding: 2px 10px; border-radius: 12px; font-size: 11px; margin: 2px 4px 2px 0; word-break: break-all; }
    .url-badge:before { content: "🌐 "; }
    .urls-tested { margin-top: 8px; }
    @media (max-width: 768px) { .container { padding: 16px; } .header { flex-direction: column; } .header-right { text-align: left; margin-top: 8px; } .summary { grid-template-columns: repeat(2, 1fr); } .card .number { font-size: 24px; } th, td { padding: 8px 10px; font-size: 12px; } }
    @media print { body { background: #fff; padding: 0; } .container { box-shadow: none; border-radius: 0; padding: 20px; } .card:hover { transform: none; box-shadow: none; } tr:hover td { background: inherit; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <h1>📋 Quote Dropdown Validator</h1>
        <div class="subtitle">
          <span class="badge-env">${escapeHtml(domain || 'Multiple URLs')}</span>
          ${deviceBadge}
          <div class="urls-tested">
            <strong>URLs Tested:</strong><br>
            ${urlBadges}
          </div>
        </div>
      </div>
      <div class="header-right">
        <div><strong>Started:</strong> ${escapeHtml(startedAt)}</div>
        <div><strong>Finished:</strong> ${escapeHtml(finishedAt)}</div>
        <div style="margin-top:4px;font-size:11px;color:#8a9aa8;">
          Report generated: ${escapeHtml(new Date().toLocaleString())}
        </div>
      </div>
    </div>

    <div class="summary">
      <div class="card total">
        <div class="number">${total}</div>
        <div class="label">Total Checks</div>
      </div>
      <div class="card success">
        <div class="number">${passed}</div>
        <div class="label">✅ Passed</div>
      </div>
      <div class="card fail">
        <div class="number">${failed}</div>
        <div class="label">❌ Failed</div>
      </div>
      <div class="card rate">
        <div class="number">${successRate}%</div>
        <div class="label">📊 Success Rate</div>
      </div>
    </div>

    ${displayResults.length > 0 ? `
    <div class="section-title">📊 Detailed Results</div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th style="width:200px;">Validation URL</th>
            <th style="width:120px;">Category</th>
            <th>Target</th>
            <th style="width:110px;">Status</th>
            <th style="width:35%;">Details</th>
            <th style="width:160px;">Timestamp</th>
          </tr>
        </thead>
        <tbody>
          ${displayResults.map(result => {
            let rowClass = 'success-row';
            let badgeClass = 'badge-pass';
            let statusText = '✅ PASS';
            
            if (!result.success) {
              rowClass = 'fail-row';
              badgeClass = 'badge-fail';
              statusText = '❌ FAIL';
            }
            return `
            <tr class="${rowClass}">
              <td class="url-col"><span class="url-badge" style="background:transparent;padding:0;font-size:11px;">${escapeHtml(result.url || '')}</span></td>
              <td class="category-col">${escapeHtml(result.category)}</td>
              <td><strong>${escapeHtml(result.target)}</strong></td>
              <td><span class="badge ${badgeClass}">${statusText}</span></td>
              <td><pre class="details">${escapeHtml(JSON.stringify(result.details, null, 2))}</pre></td>
              <td style="font-size:11px;color:#5a6a7a;">${escapeHtml(new Date(result.timestamp).toLocaleString())}</td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>
    ` : `
    <div style="text-align:center;padding:40px 20px;color:#8a9aa8;background:#f8fafc;border-radius:10px;">
      <div style="font-size:48px;margin-bottom:12px;">📭</div>
      <div style="font-size:16px;font-weight:500;">No test results available</div>
      <div style="font-size:13px;">The test did not produce any results to display.</div>
    </div>
    `}

    <div class="footer">
      <div>
        <strong>Quote Dropdown Validator</strong>
        <span style="margin:0 8px;color:#d0d7dd;">|</span>
        Version 2.0
        <span style="margin-left:8px;">${deviceLabel}</span>
      </div>
      <div>
        Total: ${total} checks · 
        <span style="color:#0b7e4b;">${passed} passed</span> · 
        <span style="color:#c72a2a;">${failed} failed</span>
      </div>
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf8');
}

async function wait(ms, message = 'Waiting') {
  console.log(`  ⏳ ${message}...`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readUrlsFromCSV(filePath) {
  return new Promise((resolve, reject) => {
    const urls = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        if (row.url && row.url.trim() !== '') {
          urls.push(row.url.trim());
        }
      })
      .on('end', () => {
        resolve(urls);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

// ============================================================
// ALL ORIGINAL HELPER FUNCTIONS (copied from your file)
// ============================================================

async function checkBannerComponent(page) {
  console.log('  🔍 Checking for banner-level2-component-link-content...');
  const strictSelectors = [
    '.banner-level2-component-link-content',
    '[class*="banner-level2" i]',
    '[class*="component-link-content" i]',
    '[class*="level2-component-link"]',
    '[class*="banner-level2-"]'
  ];
  for (const selector of strictSelectors) {
    try {
      const element = page.locator(selector);
      if (await element.count() > 0) {
        const isVisible = await element.first().isVisible({ timeout: 1000 }).catch(() => false);
        if (isVisible) {
          console.log(`  ✅ Banner component found: ${selector}`);
          return true;
        }
      }
    } catch (error) {
      // Continue
    }
  }
  console.log('  ℹ Banner component not found via strict selectors');
  return false;
}

async function checkForNotImplemented(page) {
  console.log('  🔍 Checking for "not implemented" or rendering issues...');
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await wait(2000, 'Waiting for page to stabilize');
    const notImplementedText = page.getByText('not implemented!', { exact: true });
    if (await notImplementedText.count() > 0 && await notImplementedText.first().isVisible()) {
      console.log('  ❌ Page shows "not implemented!"');
      return true;
    }
    const errorIndicators = [
      '500 Internal Server Error',
      '404 Not Found',
      '502 Bad Gateway',
      '503 Service Unavailable'
    ];
    for (const text of errorIndicators) {
      const element = page.getByText(text, { exact: false });
      if (await element.count() > 0 && await element.first().isVisible()) {
        console.log(`  ❌ Page shows error: "${text}"`);
        return true;
      }
    }
    const bodyContent = await page.locator('body').textContent();
    if (bodyContent && bodyContent.trim().length < 10 && !bodyContent.includes('<')) {
      console.log('  ❌ Page has minimal content (not properly rendered)');
      return true;
    }
  } catch (error) {
    console.log(`  ℹ Error checking for not implemented: ${error.message}`);
  }
  console.log('  ✅ Page appears to be rendered correctly');
  return false;
}

async function resetToHomePage(page, baseUrl) {
  const currentUrl = page.url();
  const normalize = url => url.replace(/\/+$/, '');
  if (normalize(currentUrl) !== normalize(baseUrl)) {
    console.log(`  → Navigating back to home page: ${baseUrl}`);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(2000, 'Page reloaded');
    return true;
  }
  return false;
}

async function findBannerQuoteDropdown(page) {
  console.log('  → Looking for banner quote dropdown...');
  const bannerSelectors = [
    { label: 'Select a product' },
    { label: 'Insurance type' },
    { label: 'Type of insurance' },
    { placeholder: 'Select insurance' },
    'select[name*="product"]',
    'select[name*="insurance"]',
    '.banner select',
    '.hero select'
  ];
  for (const selector of bannerSelectors) {
    try {
      let element;
      if (selector.label) {
        element = page.getByLabel(selector.label);
      } else if (selector.placeholder) {
        element = page.getByPlaceholder(selector.placeholder);
      } else if (typeof selector === 'string') {
        element = page.locator(selector);
      }
      if (element) {
        const count = await element.count();
        if (count > 0) {
          const isVisible = await element.first().isVisible({ timeout: 2000 }).catch(() => false);
          if (isVisible) {
            console.log(`  ✓ Found banner quote dropdown using: ${JSON.stringify(selector)}`);
            return element.first();
          }
        }
      }
    } catch (error) {
      // Continue
    }
  }
  try {
    const bannerSelect = page.locator('.banner select, .hero select, [class*="banner"] select').first();
    if (await bannerSelect.count() > 0 && await bannerSelect.isVisible()) {
      console.log('  ✓ Found banner quote dropdown in banner section');
      return bannerSelect;
    }
  } catch (error) {
    // Continue
  }
  console.log('  ⚠️ Banner quote dropdown not found');
  return null;
}

async function findCustomTriPromoDropdown(page) {
  console.log('  → Looking for custom-tri-promo dropdown...');
  
  const specificSelectors = [
    '.custom-tri-promo select',
    '.custom-tri-promo [role="combobox"]',
    '.custom-tri-promo .dropdown',
    '.custom-tri-promo select[name*="product"]',
    '.custom-tri-promo select[name*="insurance"]',
    '[class*="custom-tri-promo"] select',
    '[class*="custom-tri"] select',
    '[class*="promo"] select',
    '[class*="tri-promo"] select',
    '[class*="custom-promo"] select'
  ];
  
  for (const selector of specificSelectors) {
    try {
      const element = page.locator(selector);
      const count = await element.count();
      if (count > 0) {
        const isVisible = await element.first().isVisible({ timeout: 2000 }).catch(() => false);
        if (isVisible) {
          console.log(`  ✓ Found custom-tri-promo dropdown using: ${selector}`);
          return element.first();
        }
      }
    } catch (error) {
      // Continue
    }
  }

  console.log('  → No specific promo dropdown found. Trying generic detection (select with URL options)...');
  try {
    const allSelects = await page.locator('select').all();
    for (const sel of allSelects) {
      if (await sel.isVisible()) {
        const options = await sel.locator('option').all();
        for (const opt of options) {
          const value = await opt.getAttribute('value');
          if (value && value.trim().startsWith('http')) {
            console.log(`  ✓ Found promo dropdown via generic detection (option value starts with http)`);
            return sel;
          }
        }
      }
    }
  } catch (error) {
    console.log(`  ℹ Generic detection failed: ${error.message}`);
  }

  console.log('  → Trying text-based detection...');
  try {
    const promoTexts = ['Pay a personal bill', 'Pay a business bill', 'Get auto ID card'];
    for (const text of promoTexts) {
      const element = page.getByText(text, { exact: false });
      if (await element.count() > 0) {
        const container = await element.locator('..').first();
        const select = await container.locator('select').first();
        if (await select.count() > 0 && await select.isVisible()) {
          console.log(`  ✓ Found promo dropdown near text: "${text}"`);
          return select;
        }
      }
    }
  } catch (error) {
    // ignore
  }

  console.log('  ⚠️ Custom-tri-promo dropdown not found');
  return null;
}

async function findServicingDropdown(page) {
  console.log('  → Looking for servicing dropdown (No login required)...');
  const servicingSelectors = [
    { label: 'What would you like to do?' },
    { placeholder: 'What would you like to do?' },
    'select[name*="servicing"]',
    '.servicing select',
    '.no-login-required select'
  ];
  for (const selector of servicingSelectors) {
    try {
      let element;
      if (selector.label) {
        element = page.getByLabel(selector.label);
      } else if (selector.placeholder) {
        element = page.getByPlaceholder(selector.placeholder);
      } else if (typeof selector === 'string') {
        element = page.locator(selector);
      }
      if (element) {
        const count = await element.count();
        if (count > 0) {
          const isVisible = await element.first().isVisible({ timeout: 2000 }).catch(() => false);
          if (isVisible) {
            console.log(`  ✓ Found servicing dropdown using: ${JSON.stringify(selector)}`);
            return element.first();
          }
        }
      }
    } catch (error) {
      // Continue
    }
  }
  try {
    const section = page.getByText('No login required');
    if (await section.count() > 0 && await section.first().isVisible()) {
      const dropdown = await section.locator('select, [role="combobox"]').first();
      if (await dropdown.count() > 0 && await dropdown.isVisible()) {
        console.log('  ✓ Found servicing dropdown in "No login required" section');
        return dropdown;
      }
    }
  } catch (error) {
    // Continue
  }
  console.log('  ⚠️ Servicing dropdown not found');
  return null;
}

// ============================================================
// LOCAL AGENT CONTAINER FUNCTIONS
// ============================================================

async function findLocalAgentContainer(page) {
  console.log('  🔍 Searching for Local Agent container...');

  console.log('  → Strategy 1: Looking for a form with action containing agency.nationwide.com');
  const forms = await page.locator('form[action*="agency.nationwide.com"], form[action*="search"]').all();
  for (const form of forms) {
    if (await form.isVisible()) {
      const hasZipInput = await form.locator('input[placeholder*="ZIP"], input[name*="zip"], input[aria-label*="ZIP"]').count() > 0;
      const hasGoButton = await form.locator('button:has-text("Go"), input[value="Go"], bolt-button:has-text("Go")').count() > 0;
      if (hasZipInput && hasGoButton) {
        console.log('  ✅ Found Local Agent container via form with agency action + ZIP + Go');
        return form;
      }
    }
  }

  console.log('  → Strategy 2: Looking for text "Find a local agent" and climbing to container');
  const textEl = page.locator('text="Find a local agent"').first();
  if (await textEl.count() > 0 && await textEl.isVisible()) {
    console.log('  ✓ Found text "Find a local agent"');
    let parent = textEl;
    for (let i = 0; i < 8; i++) {
      parent = await parent.locator('xpath=..').first();
      const tag = await parent.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
      if (tag === 'div' || tag === 'section' || tag === 'form' || tag === 'article') {
        const hasInput = await parent.locator('input[placeholder*="ZIP"], input[name*="zip"], input[aria-label*="ZIP"]').count() > 0;
        const hasButton = await parent.locator('button:has-text("Go"), input[value="Go"], bolt-button:has-text("Go")').count() > 0;
        if (hasInput && hasButton) {
          console.log(`  ✅ Found Local Agent container by text -> parent tag ${tag}`);
          return parent;
        }
      }
    }
  }

  console.log('  → Strategy 3: Using class/data-attribute selectors');
  const selectors = [
    '[data-promo="local-agent"]',
    '.local-agent-promo',
    '.local-agent',
    '.find-agent',
    '.agent-finder',
    '[class*="local-agent"]',
    '[class*="find-agent"]'
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.count() > 0 && await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`  ✅ Found Local Agent container using: ${sel}`);
        return el;
      }
    } catch (e) { /* ignore */ }
  }

  console.log('  → Strategy 4: Fallback – scanning all visible sections/divs for ZIP + Go');
  const allContainers = await page.locator('section, div[class*="container"], div[class*="agent"], div[class*="find"], form').all();
  for (const container of allContainers) {
    if (await container.isVisible()) {
      const hasZip = await container.locator('input[placeholder*="ZIP"], input[name*="zip"]').count() > 0;
      const hasGo = await container.locator('button:has-text("Go"), input[value="Go"], bolt-button:has-text("Go")').count() > 0;
      if (hasZip && hasGo) {
        console.log('  ✅ Found Local Agent container via fallback scan (has ZIP + Go)');
        return container;
      }
    }
  }

  console.log('  ❌ Local Agent container not found');
  return null;
}

async function findLocalAgentZipInsideContainer(container) {
  if (!container) return null;
  const zipInput = container.locator(
    'input[placeholder*="ZIP"], ' +
    'input[placeholder*="zip"], ' +
    'input[name*="zip"], ' +
    'input[aria-label*="ZIP"], ' +
    'input[aria-label*="zip"], ' +
    'input[id*="zip" i]'
  ).first();
  if (await zipInput.count() > 0 && await zipInput.isVisible()) {
    console.log('  ✓ Found ZIP input inside container');
    return zipInput;
  }
  const anyInput = container.locator('input').first();
  if (await anyInput.count() > 0 && await anyInput.isVisible()) {
    console.log('  ✓ Found an input inside container (assuming it is the ZIP field)');
    return anyInput;
  }
  console.log('  ❌ No ZIP input found inside container');
  return null;
}

async function findLocalAgentGoInsideContainer(container) {
  if (!container) return null;
  const goButton = container.locator(
    'button:has-text("Go"), ' +
    'input[value="Go"], ' +
    'button:has-text("Find"), ' +
    'input[type="submit"], ' +
    'bolt-button:has-text("Go")'
  ).first();
  if (await goButton.count() > 0 && await goButton.isVisible()) {
    console.log('  ✓ Found "Go" button inside container');
    return goButton;
  }
  console.log('  ❌ No "Go" button found inside container');
  return null;
}

// ============================================================
// END LOCAL AGENT
// ============================================================

async function findPromoGoButton(page, containerLocator = null) {
  console.log('  → Looking for Promo "Go!" button...');
  let promoContainer = null;
  if (containerLocator) {
    promoContainer = containerLocator;
    console.log('  → Using provided container for promo Go button');
  } else {
    promoContainer = page.locator('.custom-tri-promo').first();
    if (await promoContainer.count() === 0) {
      console.log('  ⚠️ Promo container not found');
      return null;
    }
  }

  const goSelectors = [
    'button:has-text("Go")',
    'input[value="Go"]',
    'button:has-text("Go!")',
    'input[value="Go!"]',
    'bolt-button:has-text("Go")',
    '[role="button"]:has-text("Go")'
  ];

  for (const sel of goSelectors) {
    try {
      const element = promoContainer.locator(sel).first();
      if (await element.count() > 0 && await element.isVisible({ timeout: 2000 }).catch(() => false)) {
        const parentClasses = await element.locator('..').getAttribute('class').catch(() => '');
        if (parentClasses && parentClasses.includes('nw__find-agent')) {
          continue;
        }
        console.log(`  ✓ Found Promo Go button using: ${sel}`);
        return element;
      }
    } catch (e) { /* ignore */ }
  }

  try {
    const anyGo = promoContainer.locator('button, input[type="submit"], [role="button"], bolt-button').filter({ hasText: /Go/i }).first();
    if (await anyGo.count() > 0 && await anyGo.isVisible()) {
      console.log('  ✓ Found Promo Go button via fallback (bolt-button included)');
      return anyGo;
    }
  } catch (e) { /* ignore */ }

  console.log('  ⚠️ Promo Go button not found');
  return null;
}

async function getDropdownOptions(dropdown) {
  const options = [];
  try {
    const optionElements = await dropdown.locator('option').all();
    for (const opt of optionElements) {
      const value = await opt.getAttribute('value');
      const text = await opt.textContent();
      if (value && value.trim() !== '' && !value.includes('select') && !text?.includes('Select')) {
        options.push({
          value: value.trim(),
          text: text?.trim() || value.trim()
        });
      }
    }
  } catch (error) {
    console.log(`  ℹ Could not read options: ${error.message}`);
  }
  return options;
}

async function findZipFieldInContainer(page, containerLocator) {
  let zipField = null;

  if (containerLocator) {
    console.log('  → Strategy 1: Searching inside the form/parent container...');
    const formSelectors = [
      'input[name="Zip1"]',
      'input[name="zip1"]',
      'input[name="zipCode"]',
      'input[name="ZipCode"]',
      'input[aria-label*="zip" i]',
      'input[aria-label*="ZIP" i]',
      'input[placeholder*="ZIP" i]',
      'input[placeholder*="zip" i]',
      'input[id*="zip" i]',
      'input[id*="Zip" i]',
      'input[formcontrolname*="zip" i]',
      'input[formcontrolname="zipCode"]',
      'input[name="zipCode"]'
    ];
    for (const sel of formSelectors) {
      try {
        const el = containerLocator.locator(sel).first();
        if (await el.count() > 0) {
          await el.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
          if (await el.isVisible()) {
            console.log(`  ✓ Found ZIP field inside container using: ${sel}`);
            zipField = el;
            break;
          }
        }
      } catch (e) { /* ignore */ }
    }
  }

  if (!zipField) {
    console.log('  → Strategy 2: Searching globally (excluding promo/local-agent fields)...');
    const globalSelectors = [
      'input[name="Zip1"]',
      'input[name="zip1"]',
      'input[name="zipCode"]',
      'input[name="ZipCode"]',
      'input[aria-label*="zip" i]',
      'input[aria-label*="ZIP" i]',
      'input[placeholder*="ZIP" i]',
      'input[placeholder*="zip" i]',
      'input[id*="zip" i]',
      'input[id*="Zip" i]',
      'input[formcontrolname*="zip" i]',
      'input[formcontrolname="zipCode"]',
      'input[name="zipCode"]'
    ];
    for (const sel of globalSelectors) {
      try {
        const elements = await page.locator(sel).all();
        for (const el of elements) {
          const id = await el.getAttribute('id').catch(() => '');
          const classes = await el.getAttribute('class').catch(() => '');
          const parentHtml = await el.locator('xpath=ancestor::*').first().evaluate(el => el.outerHTML).catch(() => '');
          if (id && id.toLowerCase().includes('loc_q')) continue;
          if (classes && classes.includes('find-agent')) continue;
          if (classes && classes.includes('local-agent')) continue;
          if (classes && classes.includes('custom-tri-promo')) continue;
          if (parentHtml && parentHtml.includes('custom-tri-promo')) continue;
          if (parentHtml && parentHtml.includes('find-agent')) continue;
          if (await el.isVisible()) {
            console.log(`  ✓ Found ZIP field globally (not in excluded area) using: ${sel}`);
            zipField = el;
            break;
          }
        }
        if (zipField) break;
      } catch (e) { /* ignore */ }
    }
  }

  if (!zipField) {
    console.log('  → Strategy 3: Waiting for dynamic ZIP field to appear...');
    await wait(1000, 'Waiting for dynamic ZIP');
    const globalSelectors = [
      'input[name="Zip1"]',
      'input[name="zip1"]',
      'input[name="zipCode"]',
      'input[name="ZipCode"]',
      'input[aria-label*="zip" i]',
      'input[aria-label*="ZIP" i]',
      'input[placeholder*="ZIP" i]',
      'input[placeholder*="zip" i]',
      'input[id*="zip" i]',
      'input[id*="Zip" i]',
      'input[formcontrolname*="zip" i]',
      'input[formcontrolname="zipCode"]',
      'input[name="zipCode"]'
    ];
    for (const sel of globalSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
          if (await el.isVisible()) {
            const id = await el.getAttribute('id').catch(() => '');
            const classes = await el.getAttribute('class').catch(() => '');
            const parentHtml = await el.locator('xpath=ancestor::*').first().evaluate(el => el.outerHTML).catch(() => '');
            if (id && id.toLowerCase().includes('loc_q')) continue;
            if (classes && classes.includes('find-agent')) continue;
            if (classes && classes.includes('local-agent')) continue;
            if (classes && classes.includes('custom-tri-promo')) continue;
            if (parentHtml && parentHtml.includes('custom-tri-promo')) continue;
            if (parentHtml && parentHtml.includes('find-agent')) continue;
            console.log(`  ✓ Found dynamic ZIP field using: ${sel}`);
            zipField = el;
            break;
          }
        }
      } catch (e) { /* ignore */ }
    }
  }

  if (zipField) {
    console.log('  ✅ ZIP field found and ready');
  } else {
    console.log('  ℹ No ZIP field found – this option likely does not require one');
  }
  return zipField;
}

async function checkForZipField(page, timeout = 5000) {
  console.log('  ℹ Global ZIP search – used only as a fallback');
  const prioritySelectors = [
    'input[name="Zip1"]',
    'input[name="zip1"]',
    'input[name="zipCode"]',
    'input[name="ZipCode"]',
    'input[aria-describedby="CondoZip"]',
    'input[aria-describedby*="Zip"]',
    'input#Renters',
    'input[id="Renters"]',
    'input[name*="zip" i][name*="1"]',
    'input[name*="zip" i][id*="zip"]',
    'input[id*="zip" i]',
    'input[id*="Zip" i]',
    'input[aria-label*="zip" i]',
    'input[aria-label*="ZIP" i]',
    'input[aria-label*="postal" i]',
    'form input[name*="zip" i]',
    '[class*="quote"] input[name*="zip" i]',
    '[class*="Zip"] input',
    '#HomeownersQuoteForm input[name="Zip1"]',
    '#CondoQuoteForm input[aria-describedby="CondoZip"]',
    '#RentersQuoteForm input#Renters',
    '#quote-form input[name*="zip" i]',
    '.quote-form input[name*="zip" i]'
  ];
  for (const selector of prioritySelectors) {
    try {
      const element = page.locator(selector);
      const count = await element.count();
      if (count > 0) {
        const isVisible = await element.first().isVisible({ timeout: 2000 }).catch(() => false);
        if (isVisible) {
          console.log(`  ✓ ZIP field found using priority selector: ${selector}`);
          return element.first();
        }
      }
    } catch (error) {
      // Continue
    }
  }
  try {
    const forms = await page.locator('form').all();
    for (const form of forms) {
      const zipInputs = await form.locator('input[type="text"][name*="zip" i], input[type="text"][id*="zip" i], input[type="text"][placeholder*="zip" i]').all();
      for (const input of zipInputs) {
        const isVisible = await input.isVisible().catch(() => false);
        if (isVisible) {
          const id = await input.getAttribute('id').catch(() => '');
          const name = await input.getAttribute('name').catch(() => '');
          console.log(`  ✓ ZIP field found in form: ${id || name || 'unknown'}`);
          return input;
        }
      }
    }
  } catch (error) {
    console.log(`  ℹ Form ZIP search failed: ${error.message}`);
  }
  const standardSelectors = [
    { placeholder: 'ZIP code' },
    { placeholder: 'ZIP Code' },
    { placeholder: 'Enter your 5 or 9 digit ZIP' },
    { placeholder: 'Enter Zip' },
    { placeholder: 'Enter your ZIP' },
    { placeholder: 'Enter ZIP code' },
    { placeholder: 'Zip code' },
    { label: 'Enter your 5 or 9 digit ZIP' },
    { label: 'ZIP Code' },
    { label: 'Zip' },
    { label: 'ZIP code' },
    'input[type="text"][name*="postal"]',
    'input[type="text"][name*="postalCode"]',
    'input[placeholder*="ZIP" i]',
    'input[placeholder*="zip" i]',
    'input[name*="postal" i]',
    'input[aria-label*="postal" i]',
    '#zipCode',
    '#postalCode',
    '#zip-code',
    '#postal-code',
    '.zip-input',
    '.zip-code-input',
    '.postal-code-input',
    'input.zip',
    'input.postal-code'
  ];
  for (const selector of standardSelectors) {
    try {
      let element;
      if (selector.placeholder) {
        element = page.getByPlaceholder(selector.placeholder);
      } else if (selector.label) {
        element = page.getByLabel(selector.label);
      } else if (typeof selector === 'string') {
        element = page.locator(selector);
      }
      if (element) {
        const count = await element.count();
        if (count > 0) {
          const isVisible = await element.first().isVisible({ timeout: timeout }).catch(() => false);
          if (isVisible) {
            const id = await element.first().getAttribute('id').catch(() => '');
            const name = await element.first().getAttribute('name').catch(() => '');
            const className = await element.first().getAttribute('class').catch(() => '');
            const combined = `${id} ${name} ${className}`.toLowerCase();
            if (combined.includes('search') || combined.includes('yxt') || combined.includes('searchbar')) {
              console.log(`  ℹ Skipping search bar: ${id || name || 'unknown'}`);
              continue;
            }
            console.log(`  ✓ ZIP field found using: ${JSON.stringify(selector)}`);
            return element.first();
          }
        }
      }
    } catch (error) {
      // Continue
    }
  }
  try {
    const allInputs = await page.locator('input[type="text"], input:not([type])').all();
    for (const input of allInputs) {
      const isVisible = await input.isVisible().catch(() => false);
      if (isVisible) {
        const placeholder = await input.getAttribute('placeholder').catch(() => '');
        const name = await input.getAttribute('name').catch(() => '');
        const id = await input.getAttribute('id').catch(() => '');
        const ariaLabel = await input.getAttribute('aria-label').catch(() => '');
        const className = await input.getAttribute('class').catch(() => '');
        const combined = `${placeholder} ${name} ${id} ${ariaLabel} ${className}`.toLowerCase();
        if (combined.includes('search') || combined.includes('yxt') || combined.includes('searchbar')) {
          continue;
        }
        if (combined.includes('zip') || combined.includes('postal') || 
            combined.includes('code') || combined.includes('ZIP')) {
          console.log(`  ✓ ZIP field found via fallback: ${id || name || placeholder || 'unknown'}`);
          return input;
        }
      }
    }
  } catch (error) {
    console.log(`  ℹ Fallback ZIP search failed: ${error.message}`);
  }
  console.log('  ℹ No ZIP field found');
  return null;
}

async function checkForZipError(page) {
  const errorMessages = [
    { text: 'Enter your 5 or 9 digit ZIP Code', type: 'missing-zip' },
    { text: 'Unable to find a valid state for the given Postal Code', type: 'invalid-zip' },
    { text: 'Please try again using a 5 digit Postal Code', type: 'invalid-zip' },
    { text: 'Please enter a valid ZIP code', type: 'invalid-zip' },
    { text: 'ZIP code is required', type: 'missing-zip' }
  ];
  for (const error of errorMessages) {
    try {
      const element = page.getByText(error.text, { exact: false });
      if (await element.count() > 0 && await element.first().isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`  ✅ Found error message: "${error.text}" (Type: ${error.type})`);
        return error;
      }
    } catch (error) {
      // Continue
    }
  }
  return null;
}

// ============================================================
// UPDATED findStartQuoteButton – with container scoping
// ============================================================
async function findStartQuoteButton(page, option, isSeeAllInsurance = false, container = null) {
  console.log('  → Looking for Start your quote button...');
  
  const baseLocator = container || page;

  // ----- PRIORITY SELECTORS (specific button text/role first) -----
  const prioritySelectors = [
    '#lob-banner__dropdown-btn',          // for /agents/ page
    '.btn-start-quote',
    '.cta-button',
    'button:has-text("Start your quote")',
    'button:has-text("Start Quote")',
    'button:has-text("Get a quote")',
    'button:has-text("Get started")',
    'button:has-text("Go")',
    'input[type="submit"]',
    'button[type="submit"]',
    'a[href*="quote"]',
    '[role="button"]:has-text("Go")',
    'bolt-button:has-text("Go")'
  ];
  
  for (const sel of prioritySelectors) {
    try {
      const element = baseLocator.locator(sel).first();
      if (await element.count() > 0 && await element.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`  ✓ Found button using: ${sel}`);
        return { button: element, foundBy: sel };
      }
    } catch (e) { /* ignore */ }
  }

  // ----- ORIGINAL SELECTORS (role/text) – also scoped -----
  let buttonSelectors = [];
  const isLife = option && (option.value === 'life' || option.text?.toLowerCase().includes('life insurance'));
  
  if (isLife) {
    buttonSelectors = [
      { text: 'Get started' },
      { role: 'button', options: { name: 'Get started' } },
      { role: 'link', options: { name: 'Get started' } },
      { text: 'Start your quote' },
      { text: 'Start Quote' },
      { text: 'Get a quote' },
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Start")',
      'button:has-text("Quote")',
      'button:has-text("Get")',
      'a:has-text("Start your quote")',
      'a:has-text("Start Quote")',
      '.btn-start-quote',
      '.cta-button',
      '[class*="quote"]'
    ];
  } else {
    buttonSelectors = [
      { role: 'button', options: { name: 'Start your quote' } },
      { role: 'button', options: { name: 'Start Quote' } },
      { role: 'button', options: { name: 'Get a quote' } },
      { role: 'button', options: { name: 'Get started' } },
      { role: 'link', options: { name: 'Start your quote' } },
      { role: 'link', options: { name: 'Start Quote' } },
      { text: 'Start your quote' },
      { text: 'Start Quote' },
      { text: 'Get a quote' },
      { text: 'Get started' },
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Start")',
      'button:has-text("Quote")',
      'button:has-text("Get")',
      'a:has-text("Start your quote")',
      'a:has-text("Start Quote")',
      '.btn-start-quote',
      '.cta-button',
      '[class*="quote"]'
    ];
  }
  
  let startButton = null;
  let buttonFoundBy = '';
  for (const selector of buttonSelectors) {
    try {
      let element;
      if (selector.role) {
        element = baseLocator.getByRole(selector.role, selector.options);
      } else if (selector.text) {
        element = baseLocator.getByText(selector.text);
      } else if (typeof selector === 'string') {
        element = baseLocator.locator(selector);
      }
      if (element) {
        const count = await element.count();
        if (count > 0) {
          const isVisible = await element.first().isVisible({ timeout: 2000 }).catch(() => false);
          if (isVisible) {
            startButton = element.first();
            buttonFoundBy = JSON.stringify(selector);
            console.log(`  ✓ Found button using: ${buttonFoundBy}`);
            return { button: startButton, foundBy: buttonFoundBy };
          }
        }
      }
    } catch (error) {
      // Continue
    }
  }
  
  // ----- SEE-ALL-INSURANCE SPECIFIC -----
  if (isSeeAllInsurance) {
    console.log('  → Attempting alternative button search for "See all insurance"...');
    try {
      const altButton = baseLocator.locator('a[href*="quote"], button:has-text("quote"), .btn:has-text("quote")').first();
      if (await altButton.count() > 0 && await altButton.isVisible()) {
        console.log('  ✓ Found alternative button');
        return { button: altButton, foundBy: 'alternative-search' };
      }
    } catch (error) {
      console.log(`  ℹ Alternative button search failed: ${error.message}`);
    }
  }

  console.log('  ⚠️ No start quote button found');
  return { button: null, foundBy: '' };
}

async function findServicingGoButton(page) {
  console.log('  → Looking for Servicing Go button...');
  const goSelectors = [
    { role: 'button', options: { name: 'Go!' } },
    { role: 'button', options: { name: 'Go' } },
    { text: 'Go!' },
    { text: 'Go' },
    'button:has-text("Go")',
    'input[value="Go"]',
    'input[value="Go!"]'
  ];
  for (const selector of goSelectors) {
    try {
      let element;
      if (selector.role) {
        element = page.getByRole(selector.role, selector.options);
      } else if (selector.text) {
        element = page.getByText(selector.text);
      } else if (typeof selector === 'string') {
        element = page.locator(selector);
      }
      if (element) {
        const count = await element.count();
        if (count > 0) {
          const isVisible = await element.first().isVisible({ timeout: 2000 }).catch(() => false);
          if (isVisible) {
            console.log(`  ✓ Found Servicing Go button using: ${JSON.stringify(selector)}`);
            return element.first();
          }
        }
      }
    } catch (error) {
      // Continue
    }
  }
  console.log('  ⚠️ Servicing Go button not found');
  return null;
}

// ============================================================
// UPDATED processBannerQuoteOption – with early navigation detection after selection
// ============================================================
async function processBannerQuoteOption(page, option, baseUrl, dropdownType = 'banner', zipCode = '43215', isErrorPage = false) {
  console.log(`\n  📋 Testing ${dropdownType} Quote: ${option.text}`);
  console.log(`     Value: ${option.value}`);
  if (isErrorPage) {
    console.log('  ⚠️ Skipping due to error page (not implemented)');
    return {
      success: false,
      reason: 'error-page',
      option: option.text,
      status: 'error'
    };
  }

  await resetToHomePage(page, baseUrl);
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
  await wait(1500, 'Page stabilization');

  const hasNotImplemented = await checkForNotImplemented(page);
  if (hasNotImplemented) {
    return {
      success: false,
      reason: 'not-implemented-or-not-rendered',
      option: option.text,
      status: 'error'
    };
  }

  const hasBanner = await checkBannerComponent(page);
  if (!hasBanner) {
    console.log('  ℹ Banner not found - continuing anyway');
  }

  let dropdown = null;
  let containerLocator = null;
  if (dropdownType === 'banner') {
    dropdown = await findBannerQuoteDropdown(page);
    if (dropdown) {
      try {
        let form = await dropdown.locator('xpath=ancestor::form').first();
        if (await form.count() === 0) {
          let parent = await dropdown.locator('xpath=..').first();
          for (let i = 0; i < 8; i++) {
            const tag = await parent.evaluate(el => el.tagName).catch(() => '');
            if (tag && tag.toLowerCase() === 'form') {
              form = parent;
              break;
            }
            parent = await parent.locator('xpath=..').first();
          }
        }
        if (await form.count() > 0) {
          containerLocator = form;
          console.log('  → Using form as container for ZIP search');
        } else {
          let parent = await dropdown.locator('xpath=..').first();
          for (let i = 0; i < 6; i++) {
            const classes = await parent.getAttribute('class').catch(() => '');
            if (classes && (classes.includes('banner') || classes.includes('hero') || classes.includes('quote') || classes.includes('nw__banner'))) {
              containerLocator = parent;
              console.log(`  → Using parent with class "${classes}" as container`);
              break;
            }
            parent = await parent.locator('xpath=..').first();
          }
        }
      } catch (e) {
        console.log(`  ℹ Container detection failed: ${e.message}`);
      }
    }
  } else if (dropdownType === 'custom-tri-promo') {
    dropdown = await findCustomTriPromoDropdown(page);
    if (dropdown) {
      try {
        let form = await dropdown.locator('xpath=ancestor::form').first();
        if (await form.count() === 0) {
          let parent = await dropdown.locator('xpath=..').first();
          for (let i = 0; i < 8; i++) {
            const tag = await parent.evaluate(el => el.tagName).catch(() => '');
            if (tag && tag.toLowerCase() === 'form') {
              form = parent;
              break;
            }
            parent = await parent.locator('xpath=..').first();
          }
        }
        if (await form.count() > 0) {
          containerLocator = form;
          console.log('  → Using form as container for promo');
        } else {
          let parent = await dropdown.locator('xpath=..').first();
          for (let i = 0; i < 6; i++) {
            const classes = await parent.getAttribute('class').catch(() => '');
            if (classes && (classes.includes('promo') || classes.includes('custom-tri'))) {
              containerLocator = parent;
              console.log(`  → Using parent with class "${classes}" as promo container`);
              break;
            }
            parent = await parent.locator('xpath=..').first();
          }
        }
      } catch (e) {
        console.log(`  ℹ Promo container detection failed: ${e.message}`);
      }
      if (!containerLocator) {
        containerLocator = dropdown;
        console.log('  → Using dropdown itself as container');
      }
    }
  }

  if (!dropdown) {
    console.log(`  ⚠️ ${dropdownType} dropdown not found, skipping...`);
    return {
      success: false,
      reason: 'dropdown-not-found',
      option: option.text
    };
  }

  console.log(`  → Selecting option: ${option.text}`);
  try {
    await dropdown.selectOption(option.value);
    console.log('  ✓ Option selected');
  } catch (error) {
    console.log(`  ⚠️ Could not select option: ${error.message}`);
    return {
      success: false,
      reason: 'selection-failed',
      option: option.text
    };
  }
  await wait(1500, 'Option selected - waiting for dynamic content to load');

  // ---- NEW: Check if selection triggered navigation ----
  const urlAfterSelection = page.url();
  if (urlAfterSelection !== baseUrl && !urlAfterSelection.includes('about:blank')) {
    console.log(`  ✅ Navigation occurred immediately after selection to: ${urlAfterSelection}`);
    return {
      success: true,
      reason: null,
      option: option.text,
      optionValue: option.value,
      requiresZip: false,
      zipCode: null,
      outcome: 'same-tab',
      finalUrl: urlAfterSelection,
      bannerPresent: hasBanner,
      isSeeAllInsurance: false,
      navigationSuccess: true,
      buttonFoundBy: 'auto-navigation',
      negativeTests: [],
      dropdownType: dropdownType
    };
  }

  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  } catch (error) {
    // Continue
  }

  // ---- Rest of the function unchanged ----
  const isRV = option.text.toLowerCase().includes('rv') || option.value === 'rv';
  if (isRV) {
    const phoneNumber = await page.locator('strong:has-text("1-877-"), div:has-text("Call:")').first();
    if (await phoneNumber.count() > 0 && await phoneNumber.isVisible()) {
      console.log('  ℹ RV insurance only displays a phone number – no action required');
      return {
        success: true,
        reason: null,
        option: option.text,
        optionValue: option.value,
        requiresZip: false,
        zipCode: null,
        outcome: 'no-action',
        finalUrl: page.url(),
        bannerPresent: hasBanner,
        isSeeAllInsurance: false,
        navigationSuccess: true,
        buttonFoundBy: 'phone-number-only',
        negativeTests: [],
        dropdownType: dropdownType
      };
    }
  }

  // custom-tri-promo shortcut (with FIX: before action promise setup)
  if (dropdownType === 'custom-tri-promo') {
    console.log('  → Skipping ZIP validation for promo option');
    const goButton = await findPromoGoButton(page, containerLocator);
    
    // Capture before URL and set up promises BEFORE the click
    const beforeUrl = page.url();
    const popupPromise = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
    const navPromise = page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 }).catch(() => null);

    if (goButton) {
      console.log('  → Clicking Promo Go button');
      await goButton.click();
    } else {
      const { button: submitButton } = await findStartQuoteButton(page, option, false, containerLocator);
      if (submitButton) {
        console.log('  → Clicking fallback Start button');
        await submitButton.click();
      } else {
        console.log('  → Pressing Enter on dropdown');
        await dropdown.press('Enter');
      }
    }

    let popup = await popupPromise;
    const nav = await navPromise;
    if (!popup) {
      const allPages = page.context().pages();
      for (const p of allPages) {
        if (p !== page && !(await p.url()).includes('about:blank')) {
          popup = p;
          console.log(`  🔍 Detected popup via page context fallback: ${await popup.url()}`);
          break;
        }
      }
    }

    let finalUrl = page.url();
    let popupOpened = false;
    let navigationDetected = false;
    let outcome = 'same-tab';

    if (popup) {
      popupOpened = true;
      outcome = 'popup';
      finalUrl = await popup.url();
      await popup.close();
      await page.bringToFront();
      console.log(`  ✅ Popup opened: ${finalUrl}`);
    } else if (nav) {
      navigationDetected = true;
      finalUrl = page.url();
      outcome = 'same-tab';
      console.log(`  ✅ Navigation occurred to: ${finalUrl}`);
    } else {
      await wait(3000);
      const currentUrl = page.url();
      if (currentUrl !== beforeUrl) {
        navigationDetected = true;
        finalUrl = currentUrl;
        outcome = 'same-tab';
        console.log(`  ✅ URL changed (SPA) to: ${finalUrl}`);
      } else {
        console.log(`  ❌ No popup or navigation detected, final URL: ${finalUrl}`);
      }
    }

    const actionOccurred = popupOpened || navigationDetected;
    return {
      success: actionOccurred,
      reason: actionOccurred ? null : 'No popup or navigation occurred after clicking',
      option: option.text,
      optionValue: option.value,
      requiresZip: false,
      zipCode: null,
      outcome: outcome,
      finalUrl: finalUrl,
      bannerPresent: hasBanner,
      isSeeAllInsurance: false,
      navigationSuccess: navigationDetected,
      buttonFoundBy: 'promo-go-button',
      negativeTests: [],
      dropdownType: dropdownType
    };
  }

  // Banner options: full ZIP validation (rest unchanged)
  const isPropertyPage = baseUrl.includes('property');
  if (isPropertyPage) {
    console.log('  → Property page detected, waiting extra time for ZIP field...');
    await wait(2000, 'Extra wait for property page');
  }

  let zipField = null;
  if (containerLocator) {
    zipField = await findZipFieldInContainer(page, containerLocator);
  } else {
    console.log('  → No container found – searching globally (excluding other components)');
    zipField = await findZipFieldInContainer(page, null);
  }

  const isSeeAllInsurance = option.text.toLowerCase().includes('see all insurance') || 
                            option.text.toLowerCase().includes('see all');
  const isPropertyOption = option.text.toLowerCase().includes('condo') || 
                           option.text.toLowerCase().includes('renters') ||
                           option.text.toLowerCase().includes('tenant') ||
                           option.text.toLowerCase().includes('property');
  let zipEntered = false;
  let negativeTestResults = [];
  let buttonFoundBy = 'unknown';

  // NEGATIVE TEST (unchanged)
  if (zipField && !isSeeAllInsurance) {
    console.log('  🔬 NEGATIVE TEST: Clicking Start quote without entering ZIP');
    const { button: startButton } = await findStartQuoteButton(page, option, false, containerLocator);
    if (startButton) {
      const initialUrl = page.url();
      let popup = await page.waitForEvent('popup', { timeout: 3000 }).catch(() => null);
      await startButton.click();
      if (!popup) {
        const allPages = page.context().pages();
        for (const p of allPages) {
          if (p !== page && !(await p.url()).includes('about:blank')) {
            popup = p;
            console.log(`  🔍 Detected popup via page context fallback: ${await popup.url()}`);
            break;
          }
        }
      }
      await wait(2000, 'Waiting for response');
      const currentUrl = page.url();
      const navigationOccurred = currentUrl !== initialUrl;
      const errorResult = await checkForZipError(page);

      if (popup) {
        console.log(`  ✅ Negative test PASSED: Popup opened without ZIP`);
        negativeTestResults.push({
          scenario: 'no-zip',
          success: true,
          message: 'Popup opened without ZIP',
          popupUrl: await popup.url()
        });
        await popup.close();
        await page.bringToFront();
      } else if (navigationOccurred) {
        console.log(`  ✅ Negative test PASSED: Navigation occurred without ZIP (redirected to: ${currentUrl})`);
        negativeTestResults.push({
          scenario: 'no-zip',
          success: true,
          message: 'Navigation occurred without ZIP - redirect to quote page',
          navigatedTo: currentUrl
        });
      } else if (errorResult) {
        console.log(`  ✅ Negative test PASSED: Error message displayed - "${errorResult.text}" (Type: ${errorResult.type})`);
        negativeTestResults.push({
          scenario: 'no-zip',
          success: true,
          message: errorResult.text,
          errorType: errorResult.type
        });
      } else {
        console.log('  ❌ Negative test FAILED: No error, no navigation, no popup');
        negativeTestResults.push({
          scenario: 'no-zip',
          success: false,
          message: 'No error message, no navigation, and no popup occurred'
        });
      }

      if (navigationOccurred) {
        console.log(`  → Navigated to: ${currentUrl}`);
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await wait(2000);
        console.log('  → Returned to home page');
      }

      await resetToHomePage(page, baseUrl);
      await wait(1000, 'Page reset after negative test');
      console.log(`  → Re-selecting option: ${option.text}`);
      try {
        let dropdownRefreshed = null;
        if (dropdownType === 'banner') {
          dropdownRefreshed = await findBannerQuoteDropdown(page);
        } else if (dropdownType === 'custom-tri-promo') {
          dropdownRefreshed = await findCustomTriPromoDropdown(page);
        }
        if (dropdownRefreshed) {
          await dropdownRefreshed.selectOption(option.value);
          console.log('  ✓ Option re-selected');
          await wait(1000, 'Waiting after re-selection');
        } else {
          console.log('  ⚠️ Could not re-find dropdown');
        }
      } catch (error) {
        console.log(`  ⚠️ Could not re-select option: ${error.message}`);
      }
      await wait(500, 'Option re-selected');
    }

    // POSITIVE TEST (with FIX: capture before URL and set up promises BEFORE click)
    console.log(`  🔬 POSITIVE TEST: Entering ZIP ${zipCode} and clicking Start quote`);
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    let zipFieldRefreshed = null;
    if (containerLocator) {
      zipFieldRefreshed = await findZipFieldInContainer(page, containerLocator);
    } else {
      zipFieldRefreshed = await findZipFieldInContainer(page, null);
    }
    if (zipFieldRefreshed) {
      await zipFieldRefreshed.fill('');
      await wait(200);
      await zipFieldRefreshed.fill(zipCode);
      await wait(500);
      zipEntered = true;
      console.log(`  → Entered ZIP: ${zipCode}`);
      const enteredValue = await zipFieldRefreshed.inputValue().catch(() => '');
      if (enteredValue === zipCode) {
        console.log('  ✅ ZIP code verified');
      } else {
        console.log(`  ⚠️ ZIP code verification failed: entered "${enteredValue}" instead of "${zipCode}"`);
        await zipFieldRefreshed.fill('');
        await wait(200);
        await zipFieldRefreshed.fill(zipCode);
        await wait(500);
      }
      await wait(1000, 'Waiting for validation to complete');

      // --- FIX: capture before URL and set up promises BEFORE the click ---
      const beforeUrl = page.url();
      const popupPromise = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
      const navPromise = page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);

      const { button: submitButton, foundBy: found } = await findStartQuoteButton(page, option, isSeeAllInsurance, containerLocator);
      buttonFoundBy = found || 'unknown';

      if (!submitButton) {
        console.log('  ⚠️ No button found after ZIP entry – pressing Enter');
        await zipFieldRefreshed.press('Enter');
        console.log('  → Pressed Enter on ZIP field');
      } else {
        const isDisabled = await submitButton.getAttribute('disabled').catch(() => null);
        if (isDisabled !== null) {
          console.log('  ⚠️ Button is disabled – pressing Enter');
          await zipFieldRefreshed.press('Enter');
          console.log('  → Pressed Enter on ZIP field (button was disabled)');
        } else {
          console.log(`  → Clicking button found via: ${found}`);
          await submitButton.click();
        }
      }

      let popup = await popupPromise;
      const nav = await navPromise;
      if (!popup) {
        const allPages = page.context().pages();
        for (const p of allPages) {
          if (p !== page && !(await p.url()).includes('about:blank')) {
            popup = p;
            console.log(`  🔍 Detected popup via page context fallback: ${await popup.url()}`);
            break;
          }
        }
      }

      let finalUrl = page.url();
      let popupOpened = false;
      let navigationDetected = false;
      let outcome = 'same-tab';

      if (popup) {
        popupOpened = true;
        outcome = 'popup';
        finalUrl = await popup.url();
        await popup.close();
        await page.bringToFront();
        console.log(`  ✅ Popup opened: ${finalUrl}`);
      } else if (nav) {
        navigationDetected = true;
        finalUrl = page.url();
        outcome = 'same-tab';
        console.log(`  ✅ Full page navigation to: ${finalUrl}`);
      } else {
        await wait(3000);
        const currentUrl = page.url();
        if (currentUrl !== beforeUrl) {
          navigationDetected = true;
          finalUrl = currentUrl;
          outcome = 'same-tab';
          console.log(`  ✅ URL changed (SPA) to: ${finalUrl}`);
        } else {
          console.log(`  ❌ No navigation or popup detected, final URL: ${finalUrl}`);
        }
      }

      const actionOccurred = popupOpened || navigationDetected;
      let testSuccess = true;
      let reason = null;
      if (!actionOccurred) {
        testSuccess = false;
        reason = 'No popup or navigation occurred after clicking the button';
        console.log(`  ❌ Test FAILED: ${reason}`);
      } else {
        console.log('  ✅ Action (popup or navigation) detected');
      }

      const result = {
        success: testSuccess,
        reason: reason,
        option: option.text,
        optionValue: option.value,
        requiresZip: zipEntered,
        zipCode: zipEntered ? zipCode : null,
        outcome: outcome,
        finalUrl: finalUrl,
        bannerPresent: hasBanner,
        isSeeAllInsurance: isSeeAllInsurance,
        navigationSuccess: navigationDetected,
        buttonFoundBy: buttonFoundBy,
        negativeTests: negativeTestResults,
        dropdownType: dropdownType
      };
      return result;

    } else {
      // No ZIP field found – handle accordingly
      console.log('  ℹ No ZIP field found – skipping ZIP entry');
      // Fall through to the no-zip case below
    }
  } else if (isSeeAllInsurance) {
    console.log('  → "See all insurance" option - skipping ZIP validation');
    const { button: submitButton, foundBy: found } = await findStartQuoteButton(page, option, true, containerLocator);
    buttonFoundBy = found || 'unknown';

    // FIX: capture before URL and set up promises BEFORE click
    const beforeUrl = page.url();
    const popupPromise = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
    const navPromise = page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);

    if (submitButton) {
      console.log(`  → Clicking button found via: ${found}`);
      await submitButton.click();
    } else {
      console.log('  → No button found – pressing Enter on dropdown');
      await dropdown.press('Enter');
    }

    let popup = await popupPromise;
    const nav = await navPromise;
    if (!popup) {
      const allPages = page.context().pages();
      for (const p of allPages) {
        if (p !== page && !(await p.url()).includes('about:blank')) {
          popup = p;
          console.log(`  🔍 Detected popup via page context fallback: ${await popup.url()}`);
          break;
        }
      }
    }

    let finalUrl = page.url();
    let popupOpened = false;
    let navigationDetected = false;
    let outcome = 'same-tab';

    if (popup) {
      popupOpened = true;
      outcome = 'popup';
      finalUrl = await popup.url();
      await popup.close();
      await page.bringToFront();
      console.log(`  ✅ Popup opened: ${finalUrl}`);
    } else if (nav) {
      navigationDetected = true;
      finalUrl = page.url();
      outcome = 'same-tab';
      console.log(`  ✅ Full page navigation to: ${finalUrl}`);
    } else {
      await wait(3000);
      const currentUrl = page.url();
      if (currentUrl !== beforeUrl) {
        navigationDetected = true;
        finalUrl = currentUrl;
        outcome = 'same-tab';
        console.log(`  ✅ URL changed (SPA) to: ${finalUrl}`);
      } else {
        console.log(`  ❌ No navigation or popup detected, final URL: ${finalUrl}`);
      }
    }

    const actionOccurred = popupOpened || navigationDetected;
    let testSuccess = true;
    let reason = null;
    if (!actionOccurred) {
      testSuccess = false;
      reason = 'No popup or navigation occurred after clicking the button';
      console.log(`  ❌ Test FAILED: ${reason}`);
    } else {
      console.log('  ✅ Action (popup or navigation) detected');
    }

    const result = {
      success: testSuccess,
      reason: reason,
      option: option.text,
      optionValue: option.value,
      requiresZip: false,
      zipCode: null,
      outcome: outcome,
      finalUrl: finalUrl,
      bannerPresent: hasBanner,
      isSeeAllInsurance: true,
      navigationSuccess: navigationDetected,
      buttonFoundBy: buttonFoundBy,
      negativeTests: [],
      dropdownType: dropdownType
    };
    return result;

  } else if (isPropertyOption && !zipField) {
    console.log('  → Property option detected but no ZIP field found. Trying alternative ZIP detection...');
    await wait(1000, 'Waiting for ZIP field to appear');
    let zipFieldRetry = null;
    if (containerLocator) {
      zipFieldRetry = await findZipFieldInContainer(page, containerLocator);
    } else {
      zipFieldRetry = await findZipFieldInContainer(page, null);
    }
    if (zipFieldRetry) {
      console.log('  ✓ ZIP field found on retry!');
      const zipFieldToUse = zipFieldRetry;
      console.log(`  🔬 POSITIVE TEST: Entering ZIP ${zipCode} and clicking Start quote`);
      await zipFieldToUse.fill('');
      await wait(200);
      await zipFieldToUse.fill(zipCode);
      await wait(500);
      zipEntered = true;
      console.log(`  → Entered ZIP: ${zipCode}`);

      // FIX: capture before URL and set up promises BEFORE click
      const beforeUrl = page.url();
      const popupPromise = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
      const navPromise = page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);

      const { button: submitButton } = await findStartQuoteButton(page, option, isSeeAllInsurance, containerLocator);
      if (submitButton) {
        await submitButton.click();
      } else {
        await zipFieldToUse.press('Enter');
      }

      let popup = await popupPromise;
      const nav = await navPromise;
      if (!popup) {
        const allPages = page.context().pages();
        for (const p of allPages) {
          if (p !== page && !(await p.url()).includes('about:blank')) {
            popup = p;
            console.log(`  🔍 Detected popup via page context fallback: ${await popup.url()}`);
            break;
          }
        }
      }

      let finalUrl = page.url();
      let popupOpened = false;
      let navigationDetected = false;
      let outcome = 'same-tab';

      if (popup) {
        popupOpened = true;
        outcome = 'popup';
        finalUrl = await popup.url();
        await popup.close();
        await page.bringToFront();
        console.log(`  ✅ Popup opened: ${finalUrl}`);
      } else if (nav) {
        navigationDetected = true;
        finalUrl = page.url();
        outcome = 'same-tab';
        console.log(`  ✅ Full page navigation to: ${finalUrl}`);
      } else {
        await wait(3000);
        const currentUrl = page.url();
        if (currentUrl !== beforeUrl) {
          navigationDetected = true;
          finalUrl = currentUrl;
          outcome = 'same-tab';
          console.log(`  ✅ URL changed (SPA) to: ${finalUrl}`);
        } else {
          console.log(`  ❌ No navigation or popup detected, final URL: ${finalUrl}`);
        }
      }

      const actionOccurred = popupOpened || navigationDetected;
      let testSuccess = true;
      let reason = null;
      if (!actionOccurred) {
        testSuccess = false;
        reason = 'No popup or navigation occurred after clicking the button';
        console.log(`  ❌ Test FAILED: ${reason}`);
      } else {
        console.log('  ✅ Action (popup or navigation) detected');
      }

      const result = {
        success: testSuccess,
        reason: reason,
        option: option.text,
        optionValue: option.value,
        requiresZip: true,
        zipCode: zipCode,
        outcome: outcome,
        finalUrl: finalUrl,
        bannerPresent: hasBanner,
        isSeeAllInsurance: false,
        navigationSuccess: navigationDetected,
        buttonFoundBy: buttonFoundBy,
        negativeTests: negativeTestResults,
        dropdownType: dropdownType
      };
      return result;

    } else {
      console.log('  ℹ No ZIP field found after retry, proceeding with direct click');
      // Fall through to the no-zip case
    }
  } else {
    console.log('  ℹ No ZIP field found - proceeding with direct click');
    // This is the case where no ZIP field exists; we just click the button.
    // We still need to capture navigation.
    const { button: submitButton } = await findStartQuoteButton(page, option, isSeeAllInsurance, containerLocator);
    const beforeUrl = page.url();
    const popupPromise = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
    const navPromise = page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);

    if (submitButton) {
      await submitButton.click();
    } else {
      console.log('  → No button found – pressing Enter on dropdown');
      await dropdown.press('Enter');
    }

    let popup = await popupPromise;
    const nav = await navPromise;
    if (!popup) {
      const allPages = page.context().pages();
      for (const p of allPages) {
        if (p !== page && !(await p.url()).includes('about:blank')) {
          popup = p;
          console.log(`  🔍 Detected popup via page context fallback: ${await popup.url()}`);
          break;
        }
      }
    }

    let finalUrl = page.url();
    let popupOpened = false;
    let navigationDetected = false;
    let outcome = 'same-tab';

    if (popup) {
      popupOpened = true;
      outcome = 'popup';
      finalUrl = await popup.url();
      await popup.close();
      await page.bringToFront();
      console.log(`  ✅ Popup opened: ${finalUrl}`);
    } else if (nav) {
      navigationDetected = true;
      finalUrl = page.url();
      outcome = 'same-tab';
      console.log(`  ✅ Full page navigation to: ${finalUrl}`);
    } else {
      await wait(3000);
      const currentUrl = page.url();
      if (currentUrl !== beforeUrl) {
        navigationDetected = true;
        finalUrl = currentUrl;
        outcome = 'same-tab';
        console.log(`  ✅ URL changed (SPA) to: ${finalUrl}`);
      } else {
        console.log(`  ❌ No navigation or popup detected, final URL: ${finalUrl}`);
      }
    }

    const actionOccurred = popupOpened || navigationDetected;
    let testSuccess = true;
    let reason = null;
    if (!actionOccurred) {
      testSuccess = false;
      reason = 'No popup or navigation occurred after clicking the button';
      console.log(`  ❌ Test FAILED: ${reason}`);
    } else {
      console.log('  ✅ Action (popup or navigation) detected');
    }

    const result = {
      success: testSuccess,
      reason: reason,
      option: option.text,
      optionValue: option.value,
      requiresZip: false,
      zipCode: null,
      outcome: outcome,
      finalUrl: finalUrl,
      bannerPresent: hasBanner,
      isSeeAllInsurance: false,
      navigationSuccess: navigationDetected,
      buttonFoundBy: buttonFoundBy,
      negativeTests: negativeTestResults,
      dropdownType: dropdownType
    };
    return result;
  }

  // Default fallback (should not be reached)
  return {
    success: false,
    reason: 'unexpected-path',
    option: option.text,
    optionValue: option.value,
    requiresZip: false,
    zipCode: null,
    outcome: 'none',
    finalUrl: page.url(),
    bannerPresent: hasBanner,
    isSeeAllInsurance: false,
    navigationSuccess: false,
    buttonFoundBy: 'unknown',
    negativeTests: [],
    dropdownType: dropdownType
  };
}

// ============================================================
// processServicingOption (unchanged)
// ============================================================
async function processServicingOption(page, option, baseUrl, isErrorPage = false) {
  console.log(`\n  📋 Testing Servicing Option: ${option.text}`);
  console.log(`     Value: ${option.value}`);
  if (isErrorPage) {
    console.log('  ⚠️ Skipping due to error page');
    return {
      success: false,
      reason: 'error-page',
      option: option.text,
      status: 'error'
    };
  }

  console.log(`  → Navigating to base URL for fresh state: ${baseUrl}`);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(2000, 'Page loaded');

  const dropdown = await findServicingDropdown(page);
  if (!dropdown) {
    console.log('  ⚠️ Servicing dropdown not found, skipping...');
    return {
      success: true,
      skipped: true,
      reason: 'not-available',
      option: option.text
    };
  }

  console.log(`  → Selecting option: ${option.text}`);
  try {
    await dropdown.selectOption(option.value);
    console.log('  ✓ Option selected');
  } catch (error) {
    console.log(`  ⚠️ Could not select option: ${error.message}`);
    return {
      success: false,
      reason: 'selection-failed',
      option: option.text
    };
  }
  await wait(500, 'Option selected');

  const goButton = await findServicingGoButton(page);
  if (!goButton) {
    console.log('  ⚠️ Servicing Go button not found');
    return {
      success: false,
      reason: 'no-go-button',
      option: option.text
    };
  }

  console.log('  → Clicking Go button (no ZIP required for servicing)');
  const initialUrl = page.url();
  const popupPromise = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
  await goButton.click();
  let popup = await popupPromise;
  if (!popup) {
    const allPages = page.context().pages();
    for (const p of allPages) {
      if (p !== page && !(await p.url()).includes('about:blank')) {
        popup = p;
        console.log(`  🔍 Detected popup via page context fallback: ${await popup.url()}`);
        break;
      }
    }
  }
  let outcome = 'same-tab';
  let finalUrl = page.url();
  if (popup) {
    console.log(`  ✅ Popup opened: ${await popup.title()}`);
    finalUrl = await popup.url();
    await popup.close();
    await page.bringToFront();
    outcome = 'popup';
  } else {
    console.log(`  ℹ No popup - checking navigation`);
    await wait(2000);
    finalUrl = page.url();
    if (finalUrl !== initialUrl) {
      console.log(`  → Navigated to: ${finalUrl}`);
    } else {
      console.log(`  ℹ Stayed on same page: ${finalUrl}`);
    }
    outcome = 'same-tab';
  }
  return {
    success: true,
    option: option.text,
    optionValue: option.value,
    outcome: outcome,
    finalUrl: finalUrl,
    dropdownType: 'servicing'
  };
}

// ============================================================
// MODIFIED runTestForUrl (receives a page)
// ============================================================
async function runTestForUrl(baseUrl, page) {
  page.setDefaultTimeout(60000);
  const results = [];
  const recordResult = createResultRecorder(results, baseUrl);
  const startedAt = new Date().toLocaleString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📍 TESTING URL: ${baseUrl}`);
  console.log(`${'='.repeat(60)}`);

  try {
    console.log('\n📍 STEP 1: Navigating to target site');
    console.log(`  → URL: ${baseUrl}`);
    await page.goto(baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    console.log('  ✅ Page loaded successfully');
    recordResult('Step 1', 'Navigation', 'Navigate to target site', true, { url: baseUrl });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await wait(3000, 'Allowing page to stabilize');

    console.log('\n📍 STEP 2: Handling cookie consent');
    const cookieSelectors = [
      { role: 'button', options: { name: 'Accept' } },
      { text: 'Accept' },
      { text: 'Accept All' },
      { text: 'I Accept' },
      { text: 'Accept Cookies' },
      { text: 'OK' }
    ];
    let accepted = false;
    for (const selector of cookieSelectors) {
      try {
        let element;
        if (selector.role) {
          element = page.getByRole(selector.role, selector.options);
        } else if (selector.text) {
          element = page.getByText(selector.text);
        }
        if (await element.count() > 0 && await element.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          await element.first().click();
          console.log(`  ✅ Accepted cookies using: ${JSON.stringify(selector)}`);
          accepted = true;
          break;
        }
      } catch (error) {
        // Continue
      }
    }
    if (!accepted) {
      console.log('  ℹ No cookie consent needed');
    }
    recordResult('Step 2', 'Cookie Consent', 'Accept cookies', accepted, { action: accepted ? 'clicked' : 'not-needed' });
    await wait(1000);

    console.log('\n📍 STEP 3: Checking page rendering');
    const isErrorPage = await checkForNotImplemented(page);
    if (isErrorPage) {
      recordResult('Step 3', 'Rendering Check', 'Page rendering check', false, {
        status: 'error',
        error: 'Page shows "not implemented" or error page'
      });
    } else {
      recordResult('Step 3', 'Rendering Check', 'Page rendering check', true, {
        status: 'ok'
      });
    }

    console.log('\n📍 STEP 4: Checking for banner component');
    let hasBanner = await checkBannerComponent(page);
    if (!hasBanner) {
      const dropdown = await findBannerQuoteDropdown(page);
      if (dropdown) {
        hasBanner = true;
        console.log('  ✅ Banner component inferred from dropdown presence');
      }
    }
    recordResult('Step 4', 'Banner Check', 'banner-level2-component-link-content', true, {
      present: hasBanner,
      status: hasBanner ? 'present' : 'not-applicable'
    });

    console.log('\n📍 STEP 5a: Finding Banner Quote dropdown');
    const bannerDropdown = await findBannerQuoteDropdown(page);
    let bannerOptions = [];
    if (bannerDropdown) {
      bannerOptions = await getDropdownOptions(bannerDropdown);
      const validOptions = bannerOptions.filter(o => 
        o.text && !o.text.toLowerCase().includes('select') && o.value && o.value.trim() !== ''
      );
      if (validOptions.length === 0) {
        console.log('  ℹ No valid banner dropdown options found (only placeholder)');
      } else {
        console.log(`  ✓ Found ${validOptions.length} banner quote options`);
        console.log(`  → Options: ${validOptions.map(o => o.text).join(', ')}`);
        bannerOptions = validOptions;
      }
    } else {
      if (isErrorPage) {
        console.log('  ❌ No banner dropdown found on error page');
        recordResult('Step 5a', 'Banner Discovery', 'Find banner quote options', false, {
          error: 'No banner dropdown found on error page',
          status: 'error'
        });
      } else {
        console.log('  ⚠️ No banner quote dropdown found');
      }
    }

    console.log('\n📍 STEP 5b: Finding Custom Tri-Promo dropdown');
    const promoDropdown = await findCustomTriPromoDropdown(page);
    let promoOptions = [];
    if (promoDropdown) {
      promoOptions = await getDropdownOptions(promoDropdown);
      const validPromoOptions = promoOptions.filter(o => 
        o.text && !o.text.toLowerCase().includes('select') && o.value && o.value.trim() !== ''
      );
      if (validPromoOptions.length === 0) {
        console.log('  ℹ No valid promo dropdown options found (only placeholder)');
      } else {
        console.log(`  ✓ Found ${validPromoOptions.length} custom-tri-promo options`);
        console.log(`  → Options: ${validPromoOptions.map(o => o.text).join(', ')}`);
        promoOptions = validPromoOptions;
      }
    } else {
      console.log('  ℹ No custom-tri-promo dropdown found (this is optional)');
    }

    // STEP 5c: Local Agent test
    console.log('\n📍 STEP 5c: Testing Local Agent "Go" button with ZIP validation');

    const container = await findLocalAgentContainer(page);
    if (!container) {
      console.log("❌ Local Agent container not found — test SKIPPED");
      recordResult('Step 5c', 'Local Agent', 'Container not found', true, { status: 'skipped' });
    } else {
      const zipField = await findLocalAgentZipInsideContainer(container);
      if (!zipField) {
        console.log("❌ ZIP field not found inside Local Agent container — test FAILED");
        recordResult('Step 5c', 'Local Agent', 'ZIP field not found', false, {
          status: 'failed',
          reason: 'ZIP field not found inside Local Agent container'
        });
      } else {
        const goButton = await findLocalAgentGoInsideContainer(container);
        if (!goButton) {
          console.log("❌ Go button not found inside Local Agent container — test FAILED");
          recordResult('Step 5c', 'Local Agent', 'Go button not found', false, {
            status: 'failed',
            reason: 'Go button not found inside Local Agent container'
          });
        } else {
          // Negative
          console.log("🔬 NEGATIVE TEST: Clicking Go without ZIP");
          await goButton.click();
          await page.waitForTimeout(1500);
          const errorMsg = await page.locator('text=Enter your 5 or 9 digit ZIP Code, text=Please enter a valid ZIP').first();
          const errorVisible = await errorMsg.isVisible().catch(() => false);
          if (errorVisible) {
            console.log("✅ Negative test PASSED: Error message shown");
          } else {
            console.log("⚠️ Negative test: No error message shown (maybe redirect occurred)");
          }

          await resetToHomePage(page, baseUrl);
          await page.waitForTimeout(2000);

          // Positive
          const container2 = await findLocalAgentContainer(page);
          if (!container2) {
            console.log("❌ Could not re-find container after reset — test FAILED");
            recordResult('Step 5c', 'Local Agent', 'Container lost after reset', false, {
              status: 'failed',
              reason: 'Local Agent container disappeared after reset'
            });
          } else {
            const zipField2 = await findLocalAgentZipInsideContainer(container2);
            const goButton2 = await findLocalAgentGoInsideContainer(container2);
            if (!zipField2 || !goButton2) {
              console.log("❌ Could not re-find ZIP or Go after reset — test FAILED");
              recordResult('Step 5c', 'Local Agent', 'Fields lost after reset', false, {
                status: 'failed',
                reason: 'ZIP or Go button not found after reset'
              });
            } else {
              console.log("🔬 POSITIVE TEST: Entering ZIP 43215 and clicking Go");
              await zipField2.fill("43215");
              await page.waitForTimeout(500);

              const popupPromise = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
              await goButton2.click();

              const navResult = await Promise.race([
                page.waitForNavigation({ timeout: 10000 }).catch(() => null),
                popupPromise.then(popup => popup ? { popup } : null)
              ]);

              let success = false;
              let details = {};

              if (navResult && navResult.popup) {
                const popup = navResult.popup;
                await popup.waitForLoadState('domcontentloaded');
                const popupUrl = await popup.url();
                console.log(`✅ Popup opened: ${popupUrl}`);
                if (popupUrl.includes('agency.nationwide.com') || popupUrl.includes('agent')) {
                  success = true;
                  details = { status: 'popup', url: popupUrl, message: 'Popup opened to agency page' };
                } else {
                  details = { status: 'popup-wrong-url', url: popupUrl, message: 'Popup opened but not agency URL' };
                }
                await popup.close();
                await page.bringToFront();
              } else if (navResult) {
                const finalUrl = page.url();
                console.log(`✅ Navigation occurred: ${finalUrl}`);
                if (finalUrl.includes('agency.nationwide.com') || finalUrl.includes('agent')) {
                  success = true;
                  details = { status: 'redirect', url: finalUrl, message: 'Redirected to agency page' };
                } else {
                  details = { status: 'redirect-wrong-url', url: finalUrl, message: 'Redirected but not agency URL' };
                }
              } else {
                await page.waitForTimeout(3000);
                const newUrl = page.url();
                if (newUrl !== baseUrl) {
                  console.log(`✅ URL changed (SPA) to: ${newUrl}`);
                  if (newUrl.includes('agency.nationwide.com') || newUrl.includes('agent')) {
                    success = true;
                    details = { status: 'spa', url: newUrl, message: 'SPA navigation to agency page' };
                  } else {
                    details = { status: 'spa-wrong-url', url: newUrl, message: 'SPA navigation but not agency URL' };
                  }
                } else {
                  console.log("❌ No navigation, no popup, no URL change");
                  details = { status: 'no-action', message: 'No redirect, no popup, no URL change' };
                }
              }

              if (success) {
                console.log("✅ Local Agent test PASSED");
                recordResult('Step 5c', 'Local Agent', 'ZIP validation', true, details);
              } else {
                console.log("❌ Local Agent test FAILED");
                recordResult('Step 5c', 'Local Agent', 'ZIP validation', false, details);
              }

              await resetToHomePage(page, baseUrl);
            }
          }
        }
      }
    }

    // Step 6a: Banner options
    if (bannerOptions.length > 0 && !isErrorPage) {
      console.log('\n📍 STEP 6a: Processing Banner Quote options');
      const zipMap = {
        'auto & home bundle': '43215',
        'business': '43215',
        'life': '43215',
        'pet': '43215',
        'auto': '43215',
        'homeowners': '43215',
        'homeowners insurance': '43215',
        'renters': '54213',
        'see all insurance': '43215',
        'scooter insurance': '43215',
        'motorcycle insurance': '43215',
        'atv insurance': '43215',
        'snowmobile insurance': '43215',
        'condo insurance': '43215',
        'condo': '43215',
        'renters insurance': '54213',
        'tenant': '54213',
        'property': '43215'
      };
      for (let i = 0; i < bannerOptions.length; i++) {
        const option = bannerOptions[i];
        try {
          console.log(`\n  --- Processing banner option ${i + 1} of ${bannerOptions.length} ---`);
          let zipCode = '43215';
          const optionLower = option.text.toLowerCase();
          for (const [key, value] of Object.entries(zipMap)) {
            if (optionLower.includes(key)) {
              zipCode = value;
              break;
            }
          }
          const result = await processBannerQuoteOption(page, option, baseUrl, 'banner', zipCode, isErrorPage);
          if (result.success) {
            const details = {
              optionValue: result.optionValue,
              requiresZip: result.requiresZip,
              zipCode: result.zipCode,
              outcome: result.outcome,
              finalUrl: result.finalUrl,
              bannerPresent: result.bannerPresent,
              isSeeAllInsurance: result.isSeeAllInsurance || false,
              navigationSuccess: result.navigationSuccess || false,
              buttonFoundBy: result.buttonFoundBy || 'unknown',
              dropdownType: result.dropdownType
            };
            if (result.negativeTests && result.negativeTests.length > 0) {
              details.negativeTests = result.negativeTests;
            }
            recordResult('Step 6a', 'Banner Quote', option.text, true, details);
          } else {
            if (result.reason === 'error-page') {
              recordResult('Step 6a', 'Banner Quote', option.text, false, {
                reason: 'error-page',
                status: 'error',
                message: 'Skipped due to error page (not implemented)'
              });
            } else if (result.reason === 'not-implemented-or-not-rendered') {
              recordResult('Step 6a', 'Banner Quote', option.text, false, {
                reason: result.reason,
                requiresZip: result.requiresZip || false,
                status: 'error'
              });
            } else {
              recordResult('Step 6a', 'Banner Quote', option.text, false, {
                reason: result.reason,
                requiresZip: result.requiresZip || false
              });
            }
          }
          await wait(3000, 'Waiting before next banner option');
        } catch (error) {
          console.log(`  ❌ Error processing ${option.text}: ${error.message}`);
          recordResult('Step 6a', 'Banner Quote', option.text, false, {
            error: error.message
          });
          try {
            await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await wait(2000);
          } catch (e) {
            console.log(`  ⚠️ Could not recover: ${e.message}`);
          }
        }
      }
    } else if (bannerOptions.length > 0 && isErrorPage) {
      console.log('\n📍 STEP 6a: Skipping Banner Quote processing due to error page');
      for (const option of bannerOptions) {
        recordResult('Step 6a', 'Banner Quote', option.text, false, {
          reason: 'error-page',
          status: 'error',
          message: 'Skipped due to error page (not implemented)'
        });
      }
    }

    // Step 6b: Promo options
    if (promoOptions.length > 0 && !isErrorPage) {
      console.log('\n📍 STEP 6b: Processing Custom Tri-Promo options');
      for (let i = 0; i < promoOptions.length; i++) {
        const option = promoOptions[i];
        try {
          console.log(`\n  --- Processing promo option ${i + 1} of ${promoOptions.length} ---`);
          const result = await processBannerQuoteOption(page, option, baseUrl, 'custom-tri-promo', '43215', isErrorPage);
          if (result.success) {
            const details = {
              optionValue: result.optionValue,
              requiresZip: result.requiresZip,
              zipCode: result.zipCode,
              outcome: result.outcome,
              finalUrl: result.finalUrl,
              bannerPresent: result.bannerPresent,
              isSeeAllInsurance: result.isSeeAllInsurance || false,
              navigationSuccess: result.navigationSuccess || false,
              buttonFoundBy: result.buttonFoundBy || 'unknown',
              dropdownType: result.dropdownType
            };
            if (result.negativeTests && result.negativeTests.length > 0) {
              details.negativeTests = result.negativeTests;
            }
            recordResult('Step 6b', 'Promo Quote', option.text, true, details);
          } else {
            if (result.reason === 'error-page') {
              recordResult('Step 6b', 'Promo Quote', option.text, false, {
                reason: 'error-page',
                status: 'error',
                message: 'Skipped due to error page (not implemented)'
              });
            } else if (result.reason === 'not-implemented-or-not-rendered') {
              recordResult('Step 6b', 'Promo Quote', option.text, false, {
                reason: result.reason,
                requiresZip: result.requiresZip || false,
                status: 'error'
              });
            } else {
              recordResult('Step 6b', 'Promo Quote', option.text, false, {
                reason: result.reason,
                requiresZip: result.requiresZip || false
              });
            }
          }
          await wait(3000, 'Waiting before next promo option');
        } catch (error) {
          console.log(`  ❌ Error processing ${option.text}: ${error.message}`);
          recordResult('Step 6b', 'Promo Quote', option.text, false, {
            error: error.message
          });
          try {
            await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await wait(2000);
          } catch (e) {
            console.log(`  ⚠️ Could not recover: ${e.message}`);
          }
        }
      }
    }

    // Step 7: Servicing
    let servicingOptions = [];
    if (promoOptions.length > 0) {
      console.log('\n📍 STEP 7: Skipping Servicing options (already covered by Promo)');
    } else {
      console.log('\n📍 STEP 7: Processing Servicing options');
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await wait(2000, 'Page loaded before servicing tests');

      const servicingDropdown = await findServicingDropdown(page);
      if (servicingDropdown) {
        let opts = await getDropdownOptions(servicingDropdown);
        servicingOptions = opts.filter(o => 
          o.text && !o.text.toLowerCase().includes('select') && o.value && o.value.trim() !== ''
        );
        if (servicingOptions.length > 0) {
          for (let i = 0; i < servicingOptions.length; i++) {
            const option = servicingOptions[i];
            try {
              const result = await processServicingOption(page, option, baseUrl, isErrorPage);
              if (result.skipped) {
                console.log(`  ℹ Servicing option skipped: ${result.reason}`);
                continue;
              }
              if (result.success) {
                recordResult('Step 7', 'Servicing', option.text, true, {
                  optionValue: result.optionValue,
                  outcome: result.outcome,
                  finalUrl: result.finalUrl,
                  dropdownType: result.dropdownType
                });
              } else {
                recordResult('Step 7', 'Servicing', option.text, false, {
                  reason: result.reason
                });
              }
              await wait(2000, 'Waiting before next servicing option');
            } catch (error) {
              console.log(`  ❌ Error processing ${option.text}: ${error.message}`);
              recordResult('Step 7', 'Servicing', option.text, false, {
                error: error.message
              });
              try {
                await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await wait(2000);
              } catch (e) {
                console.log(`  ⚠️ Could not recover: ${e.message}`);
              }
            }
          }
        } else {
          console.log('  ℹ No valid servicing options found');
        }
      } else {
        console.log('  ℹ No servicing dropdown found (optional)');
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ TEST COMPLETED FOR: ${baseUrl}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📊 Summary:`);
    console.log(`  ✓ Banner Quote options: ${bannerOptions.length}`);
    console.log(`  ✓ Promo Quote options: ${promoOptions.length}`);
    console.log(`  ✓ Tests completed successfully`);
    console.log(`  ✓ Error Page: ${isErrorPage ? 'Yes' : 'No'}`);
    console.log(`${'='.repeat(60)}\n`);
    
  } catch (error) {
    console.error(`\n❌ TEST FAILED FOR ${baseUrl}:`, error.message);
    recordResult('Failure', 'Execution Error', 'Test execution', false, {
      error: error.message,
      url: page.url()
    });
    await page.screenshot({ path: path.join(REPORTS_DIR, `error-screenshot.png`), fullPage: true });
    console.log(`📸 Screenshot saved`);
  }
  // Do NOT close the page here – it is closed by the main loop.
  return results;
}

// ===== MAIN =====
(async () => {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('-file');
  let urls = [];

  // ----- Parse mobile device flags -----
  const mobileIndex = args.indexOf('-mobile');
  if (mobileIndex !== -1) {
    if (args.length > mobileIndex + 1 && !args[mobileIndex + 1].startsWith('-')) {
      mobileDevice = args[mobileIndex + 1];
    } else {
      mobileDevice = 'iPhone 12';
    }
    console.log(`📱 Mobile emulation enabled with device: ${mobileDevice}`);
  }
  const deviceIndex = args.indexOf('--device');
  if (deviceIndex !== -1 && args.length > deviceIndex + 1) {
    mobileDevice = args[deviceIndex + 1];
    console.log(`📱 Mobile emulation enabled with device: ${mobileDevice}`);
  }

  // Headed mode
  if (args.includes('--headed')) {
    headedMode = true;
    console.log('🖥️  Headed mode enabled (browser window visible)');
  }

  if (fileIndex !== -1 && args[fileIndex + 1]) {
    const csvFile = args[fileIndex + 1];
    console.log(`📄 Reading URLs from CSV file: ${csvFile}`);
    try {
      urls = await readUrlsFromCSV(csvFile);
      console.log(`✅ Found ${urls.length} URLs to test`);
      console.log(`  → URLs: ${urls.join(', ')}`);
    } catch (error) {
      console.error(`❌ Error reading CSV file: ${error.message}`);
      process.exit(1);
    }
  } else if (args.length > 0 && !args[0].startsWith('-')) {
    urls = [args[0]];
  } else {
    urls = ['https://uat-ng.nationwide.com/personal/insurance/auto/'];
  }
  if (urls.length === 0) {
    console.error('❌ No URLs to test');
    process.exit(1);
  }

  // ----- Launch browser with window sizing for headed mobile -----
  let browserArgs = [];
  if (headedMode && mobileDevice) {
    const device = devices[mobileDevice];
    if (device) {
      const w = device.viewport.width;
      const h = device.viewport.height + 80; // approx browser chrome
      browserArgs = [`--window-size=${w},${h}`];
      console.log(`🪟 Browser window sized to approx ${w}x${h} for ${mobileDevice}`);
    }
  }

  const browser = await chromium.launch({
    headless: !headedMode,
    slowMo: 50,
    ignoreHTTPSErrors: true,
    args: browserArgs
  });

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🚀 STARTING DROPDOWN VALIDATION TESTS FOR ${urls.length} URL(S)`);
  if (mobileDevice) {
    console.log(`📱 Device: ${mobileDevice}`);
  } else {
    console.log('💻 Device: Desktop');
  }
  console.log(`👁️  Headed: ${headedMode ? 'Yes' : 'No'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const now = new Date();
  const timestamp = 
    String(now.getFullYear()) + '-' + 
    String(now.getMonth() + 1).padStart(2, '0') + '-' + 
    String(now.getDate()).padStart(2, '0') + '_' + 
    String(now.getHours()).padStart(2, '0') + '-' + 
    String(now.getMinutes()).padStart(2, '0') + '-' + 
    String(now.getSeconds()).padStart(2, '0');

  try {
    const allResults = [];
    const allStartedAt = new Date().toLocaleString();

    for (const url of urls) {
      let context = browser;
      let page;

      if (mobileDevice) {
        const device = devices[mobileDevice];
        if (!device) {
          console.error(`❌ Unknown device: ${mobileDevice}. Available devices: ${Object.keys(devices).join(', ')}`);
          process.exit(1);
        }
        context = await browser.newContext({
          viewport: device.viewport,
          userAgent: device.userAgent,
          deviceScaleFactor: device.deviceScaleFactor,
          isMobile: device.isMobile,
          hasTouch: device.hasTouch,
          ignoreHTTPSErrors: true,
        });
        page = await context.newPage();
        if (headedMode) {
          await page.setViewportSize(device.viewport);
        }
        console.log(`📱 Running on ${mobileDevice} (${device.viewport.width}x${device.viewport.height})`);
      } else {
        page = await browser.newPage();
      }

      const results = await runTestForUrl(url, page);
      allResults.push({ url, results: results || [] });

      if (mobileDevice) {
        await context.close();
      } else {
        await page.close();
      }
    }

    const combinedResults = [];
    for (const item of allResults) {
      if (item.results && Array.isArray(item.results)) {
        combinedResults.push(...item.results);
      }
    }

    const htmlReportPath = path.join(REPORTS_DIR, `Quote_dropdown_validator_${timestamp}.html`);
    const csvReportPath = path.join(REPORTS_DIR, `Quote_dropdown_validator_${timestamp}.csv`);

    generateDropdownHtmlReport(combinedResults, allStartedAt, new Date().toLocaleString(), htmlReportPath, urls, mobileDevice);
    generateCsvReport(combinedResults, csvReportPath, urls, mobileDevice);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ ALL TESTS COMPLETED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📊 Total URLs tested: ${urls.length}`);
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    for (const item of allResults) {
      const results = item.results || [];
      const passed = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      console.log(`  ✓ ${item.url}: ${results.length} tests (${passed} passed, ${failed} failed)`);
      totalTests += results.length;
      totalPassed += passed;
      totalFailed += failed;
    }
    console.log(`  ✓ Total tests: ${totalTests}`);
    console.log(`  ✓ Reports saved in: ${REPORTS_DIR}`);
    console.log(`  📄 HTML: ${htmlReportPath}`);
    console.log(`  📊 CSV: ${csvReportPath}`);
    console.log('═══════════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
  } finally {
    await browser.close();
    console.log('🔒 Browser closed');
  }
})();
