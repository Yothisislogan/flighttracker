import {createRoot} from 'react-dom/client';
import Tracker from '../components/Tracker';
import {createLocalRequest} from './data.mjs';
import '../app/globals.css';
import './style.css';

const readLocal = createLocalRequest();
async function request<T>(path:string, signal?:AbortSignal):Promise<T> {
  return await readLocal(path, signal) as T;
}
createRoot(document.getElementById('root')!).render(
  <Tracker localMode request={request} pollInterval={60000}/>
);
