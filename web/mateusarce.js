/* mateusarce.dev for LG webOS.
   Keep ES5 for webOS 3/4. TV is the upstream Free My TV Luna bridge.
   All external integrations stay explicitly unavailable until configured. */
(function () {
'use strict';
function el(id) { return document.getElementById(id); }
function text(id, value) { el(id).textContent = value; }
function store(key, value) { try { localStorage.setItem('mateusarce.' + key, JSON.stringify(value)); } catch (_) {} }
function load(key, fallback) { try { var value = JSON.parse(localStorage.getItem('mateusarce.' + key)); return value == null ? fallback : value; } catch (_) { return fallback; } }
function node(tag, cls, parent) { var n = document.createElement(tag); if (cls) n.className = cls; if (parent) parent.appendChild(n); return n; }
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
var apps = [], dock = [], remainder = [], inputs = [];
var opts = load('options', {widgets:true,light:false,motion:true});
var chosen = load('dock', []);
var tasks = load('tasks', []);
var focus = {zone:'dock',index:0,top:0}, panelRows = [], panel = '';
var moving = -1, idleAt = Date.now(), toastTimer, booted = false;
if (!Array.isArray(chosen)) chosen = [];
if (!Array.isArray(tasks)) tasks = [];
if (!opts || typeof opts !== 'object') opts = {widgets:true,light:false,motion:true};

function fit() {
 var scale = Math.min((window.innerWidth || document.documentElement.clientWidth) / 1920, (window.innerHeight || document.documentElement.clientHeight) / 1080);
 if (!scale || !isFinite(scale)) scale = 1;
 var stage = el('stage'); stage.style.webkitTransform = 'scale(' + scale + ')';
 stage.style.transform = 'scale(' + scale + ')';
 stage.style.left = Math.max(0,((window.innerWidth || 1920)-1920*scale)/2)+'px';
 stage.style.top = Math.max(0,((window.innerHeight || 1080)-1080*scale)/2)+'px';
}
function clock() {
 var d = new Date();
 text('clock',d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}));
 text('saver-clock',el('clock').textContent);
 var days=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
 var months=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
 text('date',days[d.getDay()]+' · '+d.getDate()+' de '+months[d.getMonth()]);
 text('greeting', d.getHours()<12?'BOM DIA':d.getHours()<18?'BOA TARDE':'BOA NOITE');
 text('month',months[d.getMonth()]+' '+d.getFullYear());
 var day=d.getDate(),first=new Date(d.getFullYear(),d.getMonth(),1).getDay();
 var count=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
 var container=el('calendar-days'); clear(container);
 for(var i=0;i<first+count;i++){var s=node('span','',container);if(i>=first){s.textContent=String(i-first+1);if(i-first+1===day)s.className='today';}}
}
function toast(message) {
 var t=el('toast'); t.textContent=message; t.style.display='block';
 if (toastTimer) clearTimeout(toastTimer);
 toastTimer=setTimeout(function(){t.style.display='none';},3300);
}
function sortApps(list) {
 apps=(list||[]).filter(function(a){return a&&a.id&&a.title;});
 apps.sort(function(a,b){return a.title.toLowerCase()<b.title.toLowerCase()?-1:a.title.toLowerCase()>b.title.toLowerCase()?1:0;});
 var known={},ordered=[];
 for(var i=0;i<apps.length;i++)known[apps[i].id]=apps[i];
 for(i=0;i<chosen.length;i++){if(known[chosen[i]]){ordered.push(known[chosen[i]]);delete known[chosen[i]];}}
 var leftovers=apps.filter(function(a){return !!known[a.id];});
 dock=ordered.concat(leftovers).slice(0,4);
 var ids={};for(i=0;i<dock.length;i++)ids[dock[i].id]=true;
 remainder=apps.filter(function(a){return !ids[a.id];});
 renderApps();
}
function iconPath(app) {
 var id=(app.id||'').toLowerCase(), title=(app.title||'').toLowerCase();
 var match=[
  [/netflix/,'netflix'],[/youtube/,'youtube'],[/amazon|prime.video/,'prime'],
  [/disney/,'disney'],[/hbo|hbomax|\bmax\b/,'max'],[/globoplay/,'globoplay'],
  [/spotify/,'spotify'],[/apple.tv|appletv/,'apple'],[/plex/,'plex'],
  [/crunchyroll/,'crunchyroll'],[/browser|navegador/,'browser']
 ];
 for(var j=0;j<match.length;j++)if(match[j][0].test(id)||match[j][0].test(title))return 'mateusarce-icons/'+match[j][1]+'.svg';
 return '';
}
function tile(app,i,zone,parent) {
 var b=node('div','tile',parent);
 b.setAttribute('data-zone',zone);b.setAttribute('data-index',String(i));
 var head=node('div','tile-head',b), ic=node('div','tile-icon',head);
 var label=(app.title||'?').replace(/[^A-Za-zÀ-ÿ0-9]/g,'').slice(0,2).toUpperCase()||'TV';
 var fallback=iconPath(app);
 function showIcon(src,secondary){
  if(!src){ic.textContent=label;return;}
  clear(ic);
  var img=node('img','',ic);img.src=src;img.alt='';
  img.onerror=function(){if(secondary)showIcon(secondary,'');else {clear(ic);ic.textContent=label;}};
 }
 // Prefer packaged, predictable logos: LG internal file:// icons may be denied in sandbox.
 showIcon(fallback || app.icon, fallback ? app.icon : '');
 var dot=node('span','tiny-dot',head);dot.style.background=app.color||'#15F5BA';
 var bottom=node('div','',b), title=node('div','tile-name',bottom);title.textContent=app.title;
 var subtitle=node('div','tile-meta',bottom);subtitle.textContent=app.id;
 b.onclick=function(){focus.zone=zone;focus.index=i;updateFocus();activate();};
 b.onmouseenter=function(){focus.zone=zone;focus.index=i;updateFocus();};
 return b;
}
function renderApps() {
 clear(el('dock'));clear(el('apps'));
 for(var i=0;i<dock.length;i++)tile(dock[i],i,'dock',el('dock'));
 for(i=0;i<remainder.length;i++)tile(remainder[i],i,'apps',el('apps'));
 text('app-count',apps.length && apps[0].unverified ? String(apps.length)+' atalhos sugeridos · não verificados' : String(apps.length)+' instalados');
 if(!apps.length){
 var empty=node('div','',el('dock'));empty.style.cssText='padding:50px;color:#a8a8a8;font-size:22px';
 empty.textContent='A LG não permitiu listar os aplicativos. Verifique as permissões do webOS.';
 }
 if (focus.zone==='dock' && focus.index>=dock.length) focus.index=Math.max(0,dock.length-1);
 if (focus.zone==='apps' && focus.index>=remainder.length) focus.zone='dock';
 updateFocus();
}
function renderTasks() {
 var container=el('task-list');clear(container);var done=0;
 for(var i=0;i<tasks.length;i++){
  var t=tasks[i];if(t.done)done++;
  var line=node('div','task'+(t.done?' done':''),container);
  var check=node('span','check',line);check.textContent=t.done?'✓':'';
  var label=node('span','',line);label.textContent=String(t.text||'').slice(0,70);
  (function(n){line.onclick=function(){tasks[n].done=!tasks[n].done;store('tasks',tasks);renderTasks();};})(i);
 }
 text('task-count',done+'/'+tasks.length);
}
function addTask() {
 var input=el('new-task');var value=input.value.replace(/^\s+|\s+$/g,'');
 if (!value) return;
 if (tasks.length>=5) { toast('Limite de 5 tarefas na tela inicial.');return; }
 tasks.push({text:value.slice(0,70),done:false});store('tasks',tasks);input.value='';renderTasks();
}
function applyOptions() {
 document.body.className=(opts.light?'light ':'')+(opts.motion===false?'reduce':'');
 el('widgets').style.display=opts.widgets===false?'none':'';
}
function setScroll() {
 var where=focus.zone, y=0, target=null;
 if(where==='widget')target=el('widgets');
 else if(where==='apps')target=el('apps');
 else if(where==='feed')target=el('feed');
 if(target){
  var top=target.offsetTop, p=target.offsetParent;
  while(p&&p!==el('inner')){top+=p.offsetTop;p=p.offsetParent;}
  y=-Math.max(0,top-370);
 }
 if(where==='apps')y-=Math.floor(focus.index/4)*220;
 var minY=Math.min(0,760-el('inner').offsetHeight);
 y=Math.max(minY,Math.min(0,y));
 el('inner').style.webkitTransform='translateY('+y+'px)';
 el('inner').style.transform='translateY('+y+'px)';
}
function updateFocus() {
 var nodes=document.querySelectorAll('.active');
 for(var i=0;i<nodes.length;i++)nodes[i].className=nodes[i].className.replace(/\s?active/g,'');
 var zone=focus.zone,item;
 if(zone==='top'){
  item=el('topbar').children[focus.index];
 } else if(zone==='dock'){
  item=el('dock').children[focus.index];
 } else if(zone==='apps'){
  item=el('apps').children[focus.index];
 } else if(zone==='widget'){
  item=el('widgets').children[focus.index];
 } else if(zone==='panel'){
  item=panelRows[focus.index];
 }
 if(item){item.className+=' active';}
 if(zone==='dock'||zone==='apps'){
  var app=(zone==='dock'?dock:remainder)[focus.index];
  if(app){text('shelf-name',app.title);text('shelf-meta',(zone==='dock'?'DOCA · ':'APLICATIVOS · ')+('0'+(focus.index+1)).slice(-2));
    el('ambient').style.opacity='1';}
 } else if(zone==='widget'){text('shelf-meta','WIDGETS');text('shelf-name',['Placar','Calendário','Tarefas'][focus.index]||'Painéis');}
 setScroll();
}
function closePanel() {panel='';panelRows=[];el('panel').hidden=true;focus.zone='top';focus.index=0;updateFocus();}
function showPanel(name,rows){
 panel=name;focus.zone='panel';focus.index=0;clear(el('panel-content'));
 text('panel-title',name==='inputs'?'$ entradas':'$ configurações');
 el('panel').hidden=false;panelRows=[];
 for(var i=0;i<rows.length;i++){
  (function(index,entry){
   var row=node('button','panel-row',el('panel-content'));row.textContent=entry.text;
   if(entry.meta){var info=node('small','',row);info.textContent=entry.meta;}
   row.onclick=function(){focus.index=index;updateFocus();entry.fn();};
   row.onmouseenter=function(){focus.index=index;updateFocus();};
   panelRows.push(row);
  })(i,rows[i]);
 }
 updateFocus();
}
function inputPanel(){
 TV.inputs(function(result){
  inputs=result||[];
  var rows=[];
  for(var i=0;i<inputs.length;i++){
   (function(input){
    rows.push({text:(input.label||input.key||input.id).toUpperCase(),meta:input.connected===false?'Sem sinal':'',fn:function(){
     TV.launch(input.id,null,function(ok){if(!ok)toast('Entrada indisponível no firmware da LG.');});
    }});
   })(inputs[i]);
  }
  if(!rows.length)rows.push({text:'Entradas indisponíveis',fn:function(){closePanel();}});
  showPanel('inputs',rows);
 });
}
function settingsPanel(){
 showPanel('settings',[
  {text:'Configurações da LG',meta:'sistema',fn:function(){TV.settings(function(ok){if(!ok)toast('Configurações indisponíveis.');});}},
  {text:'Tema',meta:opts.light?'Claro':'Escuro',fn:function(){opts.light=!opts.light;store('options',opts);applyOptions();settingsPanel();}},
  {text:'Widgets',meta:opts.widgets===false?'Ocultos':'Visíveis',fn:function(){opts.widgets=opts.widgets===false;store('options',opts);applyOptions();settingsPanel();}},
  {text:'Animações',meta:opts.motion===false?'Reduzidas':'Padrão',fn:function(){opts.motion=opts.motion===false;store('options',opts);applyOptions();settingsPanel();}},
  {text:'Atualizar aplicativos',meta:'LG webOS',fn:function(){closePanel();refreshApps();}},
  {text:'Organizar doca',meta:'Selecionar e mover',fn:function(){closePanel();beginReorder();}},
  {text:'Fechar',fn:closePanel}
 ]);
}
function beginReorder(){
 if(!dock.length){toast('Nenhum app para organizar.');return;}
 focus.zone='dock';focus.index=0;moving=-1;toast('Organizar: OK seleciona; ← → move; OK conclui; Voltar sai.');updateFocus();
 reorder=true;
}
var reorder=false;
function saveOrder(){chosen=dock.map(function(a){return a.id;});store('dock',chosen);}
function swapDock(a,b){
 var old=dock[a];dock[a]=dock[b];dock[b]=old;saveOrder();
 sortApps(apps);focus.index=b;moving=b;updateFocus();
}
function refreshApps(){
 TV.apps(function(list){
  if((!list||!list.length) && TV.name==='webos'){
   // Some LG firmwares deny listLaunchPoints to Developer Mode apps (#93 upstream).
   // Launch by known ID can still succeed; these are explicitly UNVERIFIED shortcuts.
   var defaults=[
    ['netflix','Netflix'],['youtube.leanback.v4','YouTube'],
    ['amazon','Prime Video'],['globoplaywebos','Globoplay'],
    ['com.disney.disneyplus-prod','Disney+'],['com.hbo.hbomax','Max'],
    ['spotify-beehive','Spotify'],['com.webos.app.browser','Navegador']
   ];
   list=defaults.map(function(a){return {id:a[0],title:a[1],icon:'',color:'#15F5BA',unverified:true};});
   toast('LG bloqueou a listagem. Exibindo atalhos sugeridos, não verificados.');
  }
  sortApps(list||[]);
  booted=true;
 });
}
function activate() {
 if(focus.zone==='top'){var which=focus.index;
  if(which===0)return inputPanel();
  if(which===1)return toast('A rede deve ser configurada nas opções da LG.');
  if(which===2){beginReorder();return;}
  return settingsPanel();
 }
 if(focus.zone==='dock'||focus.zone==='apps'){
  if(reorder && focus.zone==='dock'){
   if(moving===-1){moving=focus.index;toast('Aplicativo selecionado. Use ← e → para mudar a posição.');}
   else {moving=-1;reorder=false;saveOrder();toast('Nova ordem salva.');}
   return;
  }
  var a=(focus.zone==='dock'?dock:remainder)[focus.index];
  if(a)TV.launch(a.id,null,function(ok){if(!ok)toast('Não foi possível abrir '+a.title+'.');});
  return;
 }
 if(focus.zone==='widget'){
  if(focus.index===2){el('new-task').focus();return;}
  toast('Integração não configurada. Este painel não exibe dados inventados.');
  return;
 }
 if(focus.zone==='panel'&&panelRows[focus.index])panelRows[focus.index].click();
}
function move(dir){
 if(focus.zone==='panel'){
  if(dir==='up')focus.index=Math.max(0,focus.index-1);
  if(dir==='down')focus.index=Math.min(panelRows.length-1,focus.index+1);
  updateFocus();return;
 }
 if(focus.zone==='top'){
  if(dir==='left')focus.index=Math.max(0,focus.index-1);
  if(dir==='right')focus.index=Math.min(3,focus.index+1);
  if(dir==='down'){focus.zone='dock';focus.index=0;}
 } else if(focus.zone==='dock'){
  if(reorder&&moving!==-1&&(dir==='left'||dir==='right')){
   var target=Math.max(0,Math.min(dock.length-1,moving+(dir==='left'?-1:1)));
   if(target!==moving)swapDock(moving,target);return;
  }
  if(dir==='left')focus.index=Math.max(0,focus.index-1);
  if(dir==='right')focus.index=Math.min(dock.length-1,focus.index+1);
  if(dir==='up'){focus.zone='top';focus.index=0;}
  if(dir==='down'){focus.zone=opts.widgets===false?'apps':'widget';focus.index=0;if(opts.widgets===false&&!remainder.length)focus.zone='dock';}
 } else if(focus.zone==='widget'){
  if(dir==='left')focus.index=Math.max(0,focus.index-1);
  if(dir==='right')focus.index=Math.min(2,focus.index+1);
  if(dir==='up'){focus.zone='dock';focus.index=0;}
  if(dir==='down'){focus.zone=remainder.length?'apps':'feed';focus.index=0;}
 } else if(focus.zone==='apps'){
  if(dir==='left')focus.index=Math.max(0,focus.index-1);
  if(dir==='right')focus.index=Math.min(remainder.length-1,focus.index+1);
  if(dir==='down'){if(focus.index+4<remainder.length)focus.index+=4;else {focus.zone='feed';focus.index=0;}}
  if(dir==='up'){if(focus.index>=4)focus.index-=4;else {focus.zone=opts.widgets===false?'dock':'widget';focus.index=0;}}
 } else if(focus.zone==='feed'&&dir==='up'){focus.zone=remainder.length?'apps':opts.widgets===false?'dock':'widget';focus.index=0;}
 updateFocus();
}
function keydown(e){
 idleAt=Date.now();
 if(!el('saver').hidden){el('saver').hidden=true;e.preventDefault();return;}
 if(document.activeElement===el('new-task')){
  if(e.keyCode===13){addTask();el('new-task').blur();}
  if(e.keyCode!==27 && e.keyCode!==461 && e.keyCode!==10009)return;
  el('new-task').blur();focus.zone='widget';focus.index=2;updateFocus();e.preventDefault();return;
 }
 var k=e.keyCode;
 if(k===TV.keys.back||k===27||k===8||k===10009||k===461){
  e.preventDefault();
  if(panel){closePanel();return;}
  if(reorder){reorder=false;moving=-1;toast('Organização encerrada.');return;}
  if(focus.zone!=='dock'&&focus.zone!=='top'){focus.zone='dock';focus.index=0;updateFocus();return;}
  TV.back();return;
 }
 if(k===TV.keys.left||k===37)move('left');
 else if(k===TV.keys.right||k===39)move('right');
 else if(k===TV.keys.up||k===38)move('up');
 else if(k===TV.keys.down||k===40)move('down');
 else if(k===TV.keys.ok||k===13)activate();
 else return;
 e.preventDefault();
}
function idleCheck(){if(Date.now()-idleAt>300000 && el('saver').hidden && !panel && !reorder){el('saver').hidden=false;} }
function init(){
 fit();window.onresize=fit;clock();setInterval(clock,30000);
 applyOptions();renderTasks();
 el('add-task').onclick=addTask;
 el('new-task').onkeydown=function(e){if(e.keyCode===13){e.preventDefault();addTask();el('new-task').blur();}};
 var buttons=el('topbar').getElementsByTagName('button');
 for(var i=0;i<buttons.length;i++)(function(index){
  buttons[index].onclick=function(){focus.zone='top';focus.index=index;updateFocus();activate();};
  buttons[index].onmouseenter=function(){focus.zone='top';focus.index=index;updateFocus();};
 })(i);
 var widgets=el('widgets').getElementsByTagName('article');
 for(i=0;i<widgets.length;i++)(function(index){
  widgets[index].onclick=function(){focus.zone='widget';focus.index=index;updateFocus();activate();};
  widgets[index].onmouseenter=function(){focus.zone='widget';focus.index=index;updateFocus();};
 })(i);
 document.addEventListener('keydown',keydown,false);
 document.addEventListener('mousemove',function(){idleAt=Date.now();},false);
 document.addEventListener('click',function(){idleAt=Date.now();},false);
 setInterval(idleCheck,10000);
 refreshApps();
}
init();
})();
