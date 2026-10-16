import type {Metadata,Viewport} from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
export const metadata:Metadata={title:'Skyline — A clearer view of every flight',description:'Explore the skies on a photographic map. Find live aircraft, follow their journey, and keep your favorites close.',manifest:'/manifest.webmanifest',icons:{icon:'/favicon.svg',apple:'/icon-192.png'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#101f28'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>;}
