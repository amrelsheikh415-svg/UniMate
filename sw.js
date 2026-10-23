const C="unimate-v2",FILES=["./","./index.html","./icon-192.png","./icon-512.png"];
const NOTIFY_URL="https://meavuwntikizkfjhtnbd.supabase.co/functions/v1/notify";
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.origin!==location.origin)return; // Supabase/fonts go straight to network
  e.respondWith(fetch(e.request).then(r=>{const k=r.clone();caches.open(C).then(c=>c.put(e.request,k));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match("./index.html"))));
});
self.addEventListener("push",e=>{e.waitUntil((async()=>{
  let items=[];
  try{
    const sub=await self.registration.pushManager.getSubscription();
    const r=await fetch(NOTIFY_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"inbox",endpoint:sub&&sub.endpoint})});
    items=(await r.json()).items||[];
  }catch(_){}
  if(!items.length)items=[{title:"UniMate",body:"عندك تنبيه جديد 🔔"}];
  await Promise.all(items.map(i=>self.registration.showNotification(i.title,{body:i.body,icon:"icon-192.png",badge:"icon-192.png",dir:"rtl",lang:"ar",data:{url:"./"}})));
})())});
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(l=>l.length?l[0].focus():clients.openWindow("./")))});
