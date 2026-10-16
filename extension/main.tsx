import {createRoot} from 'react-dom/client';
import Tracker from '../components/Tracker';
import {createLocalRequest} from '../local/data.mjs';
import '../app/globals.css';
import '../local/style.css';

const readFeed = createLocalRequest({extension: true});
async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  return await readFeed(path, signal) as T;
}

// A double-clicked file has no extension host permission. Do not start requests
// or show an apparently working app when this folder has not been installed.
if (location.protocol === 'chrome-extension:') {
  createRoot(document.getElementById('root')!).render(
    <Tracker localMode extensionMode request={request} pollInterval={60000}/>
  );
} else {
  document.getElementById('root')!.textContent = 'Install this folder in Chrome: open chrome://extensions, turn on Developer mode, choose Load unpacked, and select the Skyline-Chrome folder. Then click Skyline in the Extensions menu. Opening this HTML file directly does not grant access to live flights.';
}
