const R={
 allergies:['Allergies',['substance','severity','reaction']],
 medications:['Medications',['name','dosage','pharmacy']],
 immunizations:['Immunizations',['vaccine','date_given']],
 history:['Medical history',['type','description']],
 labs:['Lab results',['test','result','test_date']],
 visits:['Visit summaries',['visit_date','summary','care_plan']],
 appointments:['Appointments',['scheduled_at','visit_type','reason']],
 messages:['Messages',['body']],
 refills:['Refill requests',['medication','pharmacy','notes']],
 intake:['Intake forms',['form_type','answers']]};
const P=[['full_name','Full legal name'],['dob','Date of birth','date'],['gender','Gender'],['language','Preferred language'],['phone','Phone'],['address','Address'],['email','Email'],['emergency_name','Emergency contact name'],['emergency_rel','Relationship'],['emergency_phone','Emergency contact phone'],['insurance_provider','Insurance provider'],['policy_no','Policy number'],['group_no','Group number'],['subscriber','Primary subscriber']];
const PATIENT_ONLY_READ=['immunizations','labs','visits']; // clinicians add these
let me,pid,tab='profile',patients=[];
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=k=>k.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const typeOf=k=>k==='scheduled_at'?'datetime-local':/date/.test(k)?'date':'text';
const fmt=(k,v)=>!v?'':k==='scheduled_at'?new Date(v).toLocaleString():/date/.test(k)?String(v).slice(0,10):v;
async function api(url,opt={}){
  const r=await fetch(url,{headers:{'Content-Type':'application/json'},credentials:'same-origin',...opt,body:opt.body&&JSON.stringify(opt.body)});
  const d=await r.json().catch(()=>({}));
  if(r.status===401&&me){me=null;return init()}
  if(!r.ok)throw new Error(d.error||'Request failed');return d}

function authView(mode='login'){
  $('#who').innerHTML='';
  $('#app').innerHTML=`<div class="card" style="max-width:420px;margin:40px auto"><h2>${mode==='login'?'Sign in':'Create your account'}</h2>
  <form id="f">${mode==='register'?'<label for="n">Full legal name</label><input id="n" required autocomplete="name"><label for="d">Date of birth</label><input id="d" type="date" required>':''}
  <label for="e">Email</label><input id="e" type="email" required autocomplete="email">
  <label for="p">Password${mode==='register'?' (10+ characters)':''}</label><input id="p" type="password" required minlength="${mode==='register'?10:1}" autocomplete="${mode==='login'?'current-password':'new-password'}">
  <div class="err" id="err" role="alert"></div><button class="btn">${mode==='login'?'Sign in':'Create account'}</button></form>
  <p><button class="btn ghost" id="sw" style="margin:0">${mode==='login'?'New patient? Create an account':'Have an account? Sign in'}</button></p></div>`;
  $('#sw').onclick=()=>authView(mode==='login'?'register':'login');
  $('#f').onsubmit=async e=>{e.preventDefault();try{
    const body={email:$('#e').value,password:$('#p').value};
    if(mode==='register'){body.full_name=$('#n').value;body.dob=$('#d').value}
    await api('/api/auth/'+mode,{method:'POST',body});init()}catch(x){$('#err').textContent=x.message}}}

async function init(){
  try{me=await api('/api/me')}catch{return authView()}
  const staff=me.role!=='patient';
  $('#who').innerHTML=`${esc(me.name||me.role)} <button class="btn ghost" id="out">Sign out</button>`;
  $('#out').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});me=null;authView()};
  if(staff){patients=await api('/api/patients');pid=pid||patients[0]?.id}else pid=me.id;
  render()}

function render(){
  const staff=me.role!=='patient';
  const tabs=[['profile','Profile'],...Object.entries(R).map(([k,v])=>[k,v[0]])];
  $('#app').innerHTML=(staff?`<label for="pt">Patient</label><select id="pt">${patients.map(p=>`<option value="${p.id}" ${p.id===pid?'selected':''}>${esc(p.full_name)}</option>`).join('')}</select><br><br>`:'')+
   `<nav aria-label="Sections">${tabs.map(([k,t])=>`<button data-t="${k}" ${k===tab?'aria-current="true"':''}>${t}</button>`).join('')}</nav><div id="view"></div>`;
  if(staff)$('#pt').onchange=e=>{pid=+e.target.value;render()};
  document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{tab=b.dataset.t;render()});
  tab==='profile'?profile():list()}

async function profile(){
  if(!pid)return $('#view').innerHTML='<div class="card">No patients yet.</div>';
  const d=await api('/api/patients/'+pid);
  $('#view').innerHTML=`<form class="card" id="pf"><div class="grid">${P.map(([k,l,t])=>`<div><label for="${k}">${l}</label><input id="${k}" type="${t||'text'}" value="${esc(String(d[k]??'').slice(0,t==='date'?10:999))}"></div>`).join('')}</div>
   <p><small>Billing: card details are not stored here. Use a PCI-compliant payment provider.</small></p>
   <div class="ok" id="ok" role="status"></div><div class="err" id="err" role="alert"></div><button class="btn">Save changes</button></form>`;
  $('#pf').onsubmit=async e=>{e.preventDefault();try{
    await api('/api/patients/'+pid,{method:'PUT',body:Object.fromEntries(P.map(([k])=>[k,$('#'+k).value]))});
    $('#err').textContent='';$('#ok').textContent='Saved'}catch(x){$('#err').textContent=x.message}}}

async function list(){
  const [title,cols]=R[tab],rows=await api(`/api/patients/${pid}/${tab}`);
  const canAdd=me.role!=='patient'||!PATIENT_ONLY_READ.includes(tab);
  const status=['appointments','refills'].includes(tab);
  $('#view').innerHTML=`<div class="card"><h2>${title}</h2>${rows.map(r=>`<div class="row ${r.sender&&r.sender!=='patient'?'msg-staff':''}">
    ${cols.map(c=>`<div>${c===cols[0]?'<strong>':''}${esc(fmt(c,r[c]))}${c===cols[0]?'</strong>':''}</div>`).join('')}
    <small>${r.sender?esc(r.sender)+' · ':''}${new Date(r.created_at).toLocaleString()}${r.status?' · '+esc(r.status):''}</small>
    ${status?statusBtns(r):''}</div>`).join('')||'<p><small>Nothing here yet.</small></p>'}</div>
  ${canAdd?`<form class="card" id="nf"><h3>Add ${title.toLowerCase()}</h3>${cols.map(c=>`<label for="f_${c}">${label(c)}</label>${c==='body'||c==='answers'||c==='notes'?`<textarea id="f_${c}" rows="3"></textarea>`:`<input id="f_${c}" type="${typeOf(c)}">`}`).join('')}
   <div class="err" id="err" role="alert"></div><button class="btn">${tab==='messages'?'Send message':tab==='appointments'?'Request appointment':'Add'}</button></form>`:''}`;
  document.querySelectorAll('[data-s]').forEach(b=>b.onclick=async()=>{try{await api(`/api/patients/${pid}/${tab}/${b.dataset.id}`,{method:'PATCH',body:{status:b.dataset.s}});list()}catch(x){alert(x.message)}});
  if(canAdd)$('#nf').onsubmit=async e=>{e.preventDefault();try{
    await api(`/api/patients/${pid}/${tab}`,{method:'POST',body:Object.fromEntries(cols.map(c=>[c,$('#f_'+c).value]))});list()}catch(x){$('#err').textContent=x.message}}}

function statusBtns(r){
  const staff=me.role!=='patient',opts=tab==='appointments'?['confirmed','completed','cancelled']:['approved','denied'];
  return (staff?opts:['cancelled']).filter(s=>tab==='refills'&&!staff?false:s!==r.status).map(s=>`<button class="btn ghost" data-id="${r.id}" data-s="${s}">${label(s)}</button>`).join('')}
init();
