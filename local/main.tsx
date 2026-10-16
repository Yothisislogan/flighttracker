import {createRoot} from 'react-dom/client';
import Tracker from '../components/Tracker';
import {createLocalRequest} from './data.mjs';
import '../app/globals.css';
import './style.css';

const launcher = location.protocol === 'http:' && location.hostname === '127.0.0.1';
const readLocal = createLocalRequest({launcher});
async function request<T>(path:string, signal?:AbortSignal):Promise<T> {
  return await readLocal(path, signal) as T;
}
createRoot(document.getElementById('root')!).render(
  <Tracker localMode request={request} pollInterval={60000}/>
);
