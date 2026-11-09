import { createServer } from 'vite';
/** A fresh browser + Vite fixture, with no Auth client or database requests. */
export async function openRuntimeFixture({url=process.env.RUNTIME_URL,viewport={width:1100,height:760}}={}) {
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
  let server;
  if(!url){server=await createServer({configFile:false,envFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});await server.listen();const address=server.httpServer.address();url=`http://127.0.0.1:${address.port}/scripts/fixtures/runtime.html`;}
  let browser;
  try {browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});const page=await browser.newPage({viewport});await page.routeWebSocket('**',socket=>socket.close());
    return {page,url,close:async()=>{await browser.close();await server?.close();}};
  } catch(error){await browser?.close();await server?.close();throw error;}
}
