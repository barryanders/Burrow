"""Native Firefox smoke test. Uses a fresh temporary profile, never the personal profile.
Run `npm run build` first, then `python3 tests/firefox-window-smoke.py`.
Requires Selenium, Firefox, and geckodriver. No Python dependencies are bundled.
"""
import time,os
from pathlib import Path
os.chdir(Path(__file__).resolve().parents[1])
Path("output/playwright/burrow-1.0").mkdir(parents=True, exist_ok=True)
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.firefox.options import Options
opt=Options(); opt.add_argument('-headless'); opt.binary_location='/Applications/Firefox.app/Contents/MacOS/firefox'
opt.set_preference('browser.shell.checkDefaultBrowser',False)
from selenium.webdriver.firefox.service import Service
d=webdriver.Firefox(options=opt,service=Service(service_args=["--allow-system-access"])); d.set_window_size(1440,1000)
wait=WebDriverWait(d,20)
try:
 d.install_addon(os.path.abspath('dist/firefox'),temporary=True)
 time.sleep(2)
 for handle in d.window_handles:
  d.switch_to.window(handle)
  if 'moz-extension:' in d.current_url: break
 print('START',d.current_url,flush=True)
 wait.until(EC.presence_of_element_located((By.ID,'gate-secret'))).send_keys('Disposable smoke password')
 d.find_element(By.ID,'gate-confirm').send_keys('Disposable smoke password')
 d.find_element(By.CSS_SELECTOR,'button[type=submit]').click()
 wait.until(EC.presence_of_element_located((By.ID,'recovery-confirm'))).click()
 d.find_element(By.ID,'finish-setup').click()
 wait.until(EC.presence_of_element_located((By.CSS_SELECTOR,'[data-action=tuck-window]')))
 print('SETUP OK',flush=True)
 root=d.current_url.split('manager.html')[0]
 manager=d.current_window_handle
 d.switch_to.new_window('tab'); d.get('https://example.com/?burrow=one')
 d.set_context('chrome'); d.execute_script('gBrowser.pinTab(gBrowser.selectedTab)'); d.set_context('content')
 d.switch_to.new_window('tab'); d.get('https://example.org/?burrow=two')
 d.switch_to.window(manager)
 time.sleep(2)
 d.find_element(By.CSS_SELECTOR,'[data-action=tuck-window]').click()
 d.find_element(By.ID,'window-name').send_keys('Weekend possibilities')
 d.find_element(By.ID,'confirm-tuck').click()
 time.sleep(1)
 d.set_context('chrome')
 print('PERMISSION PROMPT',d.execute_script('return document.querySelector("#addon-webext-permissions-notification").button.getAttribute("label")'),flush=True)
 d.execute_script('const n=document.querySelector("#addon-webext-permissions-notification"); if(n?.button)n.button.click();')
 d.set_context('content')
 time.sleep(3)
 print('HANDLES',len(d.window_handles),flush=True)
 for handle in d.window_handles:
  d.switch_to.window(handle)
  print('TAB',d.current_url,flush=True)
  if 'windowResult=' in d.current_url: curtain=handle
 d.switch_to.window(curtain)
 wait.until(EC.presence_of_element_located((By.ID,'gate-secret')))
 assert 'windowResult=saved' in d.current_url,d.current_url
 print('TUCK / OPTIONAL PERMISSION / LOCK OK',flush=True)
 d.save_screenshot('output/playwright/burrow-1.0/locked.png')
 d.find_element(By.ID,'gate-secret').send_keys('wrong password')
 d.find_element(By.CSS_SELECTOR,'button[type=submit]').click()
 wait.until(lambda driver: driver.find_element(By.ID,'gate-error').text)
 assert not d.find_elements(By.CSS_SELECTOR,'[data-action=restore-window]')
 d.find_element(By.ID,'gate-secret').clear()
 d.find_element(By.ID,'gate-secret').send_keys('Disposable smoke password')
 d.find_element(By.CSS_SELECTOR,'button[type=submit]').click()
 wait.until(EC.presence_of_element_located((By.CSS_SELECTOR,'[data-action=restore-window]')))
 d.save_screenshot('output/playwright/burrow-1.0/window-shelf.png')
 print('SHELF / WRONG PASSWORD OK',flush=True)
 d.set_window_size(560,950);time.sleep(.3)
 d.save_screenshot('output/playwright/burrow-1.0/narrow.png')
 d.set_window_size(1440,1000)
 # Theme controls do not block window actions above.
 d.find_element(By.CSS_SELECTOR,'[data-action=settings]').click()
 wait.until(EC.presence_of_element_located((By.CSS_SELECTOR,'label[data-theme-preview=lockbox]'))).click()
 wait.until(EC.presence_of_element_located((By.ID,'buy-lifetime')))
 assert 'Make Burrow your own' in d.find_element(By.TAG_NAME,'body').text
 d.find_element(By.CSS_SELECTOR,'[data-close]').click()
 assert d.find_element(By.TAG_NAME,'html').get_attribute('data-theme')=='firefox'
 # Entitlement fixture in this disposable profile only; signature verification has separate tests.
 d.execute_async_script("const done=arguments[0];import(browser.runtime.getURL('lib/storage.js')).then(m=>m.setEntitlement({kind:'lifetime',active:true,licenseId:'disposable-smoke-fixture'})).then(()=>done(true));")
 d.find_element(By.CSS_SELECTOR,'[data-action=windows]').click();time.sleep(.5)
 for theme in ['firefox-burrow','lockbox','retro','firefox']:
  d.find_element(By.CSS_SELECTOR,'[data-action=settings]').click()
  wait.until(EC.presence_of_element_located((By.CSS_SELECTOR,f'label[data-theme-preview="{theme}"]'))).click();time.sleep(.5)
  d.find_element(By.CSS_SELECTOR,'[data-action=windows]').click();time.sleep(.4)
  d.save_screenshot(f'output/playwright/burrow-1.0/theme-{theme}.png')
 d.find_element(By.ID,'window-search').send_keys('example.org')
 assert len(d.find_elements(By.CSS_SELECTOR,'[data-action=restore-window]'))==1
 d.find_element(By.ID,'window-search').send_keys('not-found')
 assert len(d.find_elements(By.CSS_SELECTOR,'[data-action=restore-window]'))==0
 d.find_element(By.ID,'window-search').clear()
 d.find_element(By.ID,'window-search').send_keys('Weekend')
 d.find_element(By.CSS_SELECTOR,'[data-action=rename-window]').click()
 rename=d.find_element(By.ID,'rename-window-name');rename.clear();rename.send_keys('Weekend reading')
 d.find_element(By.CSS_SELECTOR,'#rename-window-form button[type=submit]').click()
 wait.until(lambda driver: 'Weekend reading' in driver.find_element(By.ID,'window-results').text)
 d.find_element(By.CSS_SELECTOR,'[data-action=restore-window]').click()
 d.find_element(By.CSS_SELECTOR,'[data-open-saved-tab="0"]').click();time.sleep(1)
 d.save_screenshot('output/playwright/burrow-1.0/tab-picker.png')
 for handle in d.window_handles:
  d.switch_to.window(handle)
  if '?burrow=one' in d.current_url: d.close()
 d.switch_to.window(curtain)
 print('ALL THEMES / SEARCH / RENAME / INDIVIDUAL TAB OK',flush=True)
 d.find_element(By.ID,'confirm-restore').click()
 time.sleep(3)
 # Stay on extension page while querying real browser tabs.
 d.switch_to.window(curtain)
 d.set_context('chrome')
 tabs=d.execute_script('return [...Services.wm.getEnumerator("navigator:browser")].flatMap(w=>[...w.gBrowser.tabs].map(t=>({url:t.linkedBrowser.currentURI.spec,pinned:t.pinned})))')
 d.set_context('content')
 restored=[t for t in tabs if '?burrow=' in t.get('url','')]
 assert len(restored)==2,restored
 assert restored[0]['pinned'],restored
 print('RESTORE OK',[(t['url'],t['pinned']) for t in restored],flush=True)
 d.get(root+'popup.html');time.sleep(1)
 d.save_screenshot('output/playwright/burrow-1.0/popup.png')
 print('POPUP',d.find_element(By.TAG_NAME,'body').text[:450],flush=True)
finally:
 d.quit()
