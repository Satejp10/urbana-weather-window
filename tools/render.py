import asyncio, sys, json, pathlib
from playwright.async_api import async_playwright
async def main(html, out, params):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width':1080,'height':1080}, device_scale_factor=1)
        msgs=[]
        pg.on('console', lambda m: msgs.append(m.text))
        pg.on('pageerror', lambda e: msgs.append('PAGEERROR '+str(e)))
        await pg.goto(pathlib.Path(html).resolve().as_uri() + '#' + params)
        try:
            await pg.wait_for_function('window.__DONE === true', timeout=90000)
        except Exception as e:
            msgs.append('TIMEOUT '+str(e)[:200])
        el = await pg.query_selector('#out')
        await el.screenshot(path=out)
        for m in msgs: print('console:', m)
        await b.close()
asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv)>3 else ''))
