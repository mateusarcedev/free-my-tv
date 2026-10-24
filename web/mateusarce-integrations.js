/* MateusArce TV integrations. ES5 for older webOS Chromium.
   Public scores work independently. Private services require a read-only gateway. */
(function (window, document) {
'use strict';
var root='mateusarce.dashboard.', api='', key='', snapshot=null, scores=[], scoreErrors=[], lastUpdate='';
try { api=localStorage.getItem(root+'url')||''; key=localStorage.getItem(root+'key')||''; } catch(e) {}
var leagues=[
 {id:'bra.1',name:'Brasileirão',sport:'soccer'},
 {id:'uefa.champions',name:'Champions League',sport:'soccer'},
 {id:'nba',name:'NBA',sport:'basketball'}
];
var labels={calendar:'Google Calendar',todoist:'Todoist',github:'GitHub',gmail:'E-mail',ai:'Consumo de IA',sports:'Placares'};
var names=['calendar','todoist','github','gmail','ai'];
function $(id){return document.getElementById(id);}
function empty(element){while(element && element.firstChild)element.removeChild(element.firstChild);}
function make(tag,cls,parent,content){
 var n=document.createElement(tag);
 if(cls)n.className=cls;
 if(content!==undefined && content!==null)n.textContent=String(content);
 if(parent)parent.appendChild(n);
 return n;
}
function setStatus(id,status){
 var el=$(id);if(el)el.textContent=status;
}
function prettyDate(value,allDay){
 if(!value)return 'Sem data';
 if(allDay && /^\d{4}-\d{2}-\d{2}$/.test(value))return value.slice(8,10)+'/'+value.slice(5,7)+' · dia inteiro';
 var d=new Date(value);
 if(isNaN(d.getTime()))return String(value).slice(0,24);
 try{return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}
 catch(e){return d.toLocaleString();}
}
function sourceState(src){
 if(!api&&!(snapshot&&snapshot[src]&&snapshot[src].status==='ok'))return 'Não conectado';
 if(!snapshot)return 'Aguardando sincronização';
 var data=snapshot[src];
 if(!data)return 'Fonte indisponível';
 if(data.status==='ok')return 'Sincronizado';
 if(data.status==='unconfigured')return 'Não configurado no servidor';
 return 'Erro de sincronização';
}
function get(src){return snapshot&&snapshot[src]||{};}
function ajax(url,header,callback){
 var xhr=new XMLHttpRequest(),completed=false;
 function finish(error,payload){if(completed)return;completed=true;callback(error,payload);}
 try{
  xhr.open('GET',url,true);
  xhr.timeout=30000;
  if(header)xhr.setRequestHeader('X-Dashboard-Key',header);
  xhr.onreadystatechange=function(){
   if(xhr.readyState!==4)return;
   if(xhr.status>=200&&xhr.status<300){
    try{finish(null,JSON.parse(xhr.responseText));}
    catch(e){finish('Resposta inválida',null);}
   } else finish(xhr.status===401?'Código de acesso incorreto':'HTTP '+xhr.status,null);
  };
  xhr.onerror=function(){finish('Sem conexão / CORS / certificado TLS',null);};
  xhr.ontimeout=function(){finish('Tempo de conexão esgotado',null);};
  xhr.send();
 }catch(e){finish('Conexão bloqueada: '+e.message,null);}
}
function readScores(){
 scores=[];scoreErrors=[];
 var pending=leagues.length,found=[];
 for(var i=0;i<leagues.length;i++)(function(league){
  var url='https://site.api.espn.com/apis/site/v2/sports/'+league.sport+'/'+league.id+'/scoreboard?limit=12';
  ajax(url,'',function(err,data){
   if(err)scoreErrors.push(league.name+': '+err);
   else if(data&&data.events){
    for(var j=0;j<data.events.length;j++){
     var event=data.events[j], match=event.competitions&&event.competitions[0]||{};
     var parts=match.competitors||[],home=null,away=null;
     for(var p=0;p<parts.length;p++){
      if(parts[p].homeAway==='home')home=parts[p];
      if(parts[p].homeAway==='away')away=parts[p];
     }
     if(!home||!away)continue;
     var status=event.status&&event.status.type||{},game={
      title:(home.team&&(home.team.shortDisplayName||home.team.displayName)||'Casa')+
       ' × '+(away.team&&(away.team.shortDisplayName||away.team.displayName)||'Visitante'),
      score:(status.state==='pre'?'—':String(home.score||'0')+' × '+String(away.score||'0')),
      status:status.shortDetail||status.detail||status.description||'',
      league:league.name,date:event.date||'',live:status.state==='in',
      state:status.state||'pre'
     };
     found.push(game);
    }
   }
   pending--;
   if(!pending){
    found.sort(function(a,b){
     if(a.live!==b.live)return a.live?-1:1;
     if(a.state!==b.state){if(a.state==='pre')return -1;if(b.state==='pre')return 1;}
     return Math.abs(new Date(a.date).getTime()-Date.now())-Math.abs(new Date(b.date).getTime()-Date.now());
    });
    scores=found;renderScores();
   }
  });
 })(leagues[i]);
}
function showEntries(parent,items,formatter,max){
 empty(parent);
 if(!items||!items.length){make('p','hub-muted',parent,'Nenhum registro disponível.');return;}
 for(var i=0;i<items.length&&i<(max||6);i++){
  var val=formatter(items[i]);
  var row=make('div','hub-entry',parent);
  make('strong','',row,val[0]||'');
  if(val[1])make('small','',row,val[1]);
 }
}
function renderScores(){
 var area=$('sports');if(!area)return;
 var status=area.querySelector('.widget-top small');
 if(status)status.textContent=scoreErrors.length===leagues.length?'sem acesso à fonte':scores.length?'ao vivo / agenda':'sem jogos agora';
 var icon=area.querySelector('.placeholder-icon');if(icon)icon.style.display='none';
 var heading=area.querySelector('h2');if(heading)heading.textContent='Esportes';
 var p=area.querySelector('p');
 if(!p)return;
 p.textContent=scores.length?scores[0].title+' · '+scores[0].score:scoreErrors.length===leagues.length?'A fonte esportiva não respondeu nesta TV.':'Nenhum jogo encontrado nas ligas selecionadas.';
 var note=area.querySelector('.widget-note');
 if(note)note.textContent=scores.length?scores[0].league+' · '+scores[0].status:'Brasileirão · Champions · NBA';
}
function renderCalendar(){
 var area=$('calendar');if(!area)return;
 var old=area.querySelector('p');
 if(!old)return;
 var data=get('calendar');var items=data.items||[];
 old.textContent=sourceState('calendar');
 var box=$('hub-calendar-items');
 if(!box){box=make('div','hub-preview',area);box.id='hub-calendar-items';}
 showEntries(box,items,function(x){return [x.title,prettyDate(x.start,x.all_day)];},3);
}
function renderTasks(){
 var section=$('tasks'),holder=$('task-list');
 if(!section||!holder)return;
 var data=get('todoist'),items=data.items||[], note=section.querySelector('.widget-note');
 if(data.status==='ok'){
  showEntries(holder,items,function(x){return [x.title,x.due?'Prazo: '+x.due:'Sem prazo'];},5);
  var add=section.querySelector('.add-task');
  if(add)add.style.display='none';
  if(note)note.textContent='Todoist · leitura sincronizada';
  setStatus('task-count',String(items.length)+' tarefas');
 }else{
  var addLocal=section.querySelector('.add-task');
  if(addLocal)addLocal.style.display='';
  if(note)note.textContent='Tarefas locais · '+sourceState('todoist');
  // Keep local tasks intact until a verified remote sync succeeds.
  var list=holder.querySelectorAll('.hub-entry');
  if(list.length){empty(holder);make('p','hub-muted',holder,'Todoist desconectado. Volte às tarefas locais após reiniciar.');}
 }
}
function renderFeed(){
 var panels=$('feed')&&$('feed').querySelectorAll('.feed-panels > div');
 if(!panels||panels.length<3)return;
 var config=[['github','GitHub'],['gmail','E-mail'],['ai','Tokens de IA']];
 for(var i=0;i<3;i++){
  var p=panels[i],state=get(config[i][0]),subtitle=sourceState(config[i][0]);
  empty(p);
  make('b','',p,config[i][1]);
  if(state.status==='ok'){
   if(config[i][0]==='github')subtitle=state.notifications===null?'Repositórios públicos · '+(state.username||'GitHub'):String(state.notifications||0)+' notificações recentes · '+(state.username||'GitHub');
   if(config[i][0]==='gmail')subtitle=String(state.unread||0)+' não lidos';
   if(config[i][0]==='ai')subtitle=(state.providers||[]).length+' ferramentas monitoradas';
  }
  make('span','',p,subtitle);
  p.setAttribute('data-hub',config[i][0]);
  p.onclick=(function(id){return function(){open(id);};})(config[i][0]);
 }
}
function render(){renderCalendar();renderTasks();renderFeed();}
function loadPublicGitHub(){
 ajax('https://api.github.com/users/mateusarcedev/repos?sort=pushed&per_page=6','',function(err,data){
  if(api)return;
  var items=[];
  if(!err&&data&&data.length){
   for(var i=0;i<data.length;i++)items.push({title:data[i].name,repository:data[i].full_name||'',url:data[i].html_url||''});
  }
  snapshot={github:err?{status:'error',error:err}:{status:'ok',username:'mateusarcedev',notifications:null,items:items}};
  renderFeed();
 });
}
function sync(){
 if(!api){snapshot=null;render();loadPublicGitHub();return;}
 ajax(api.replace(/\/+$/,'')+'/v1/dashboard',key,function(err,data){
  if(err){snapshot={};for(var i=0;i<names.length;i++)snapshot[names[i]]={status:'error',error:err};}
  else snapshot=data||{};
  lastUpdate=new Date().toLocaleTimeString('pt-BR');
  render();
 });
}
function line(parent,title,detail){
 var row=make('div','hub-detail-row',parent);
 make('strong','',row,title);
 if(detail)make('small','',row,detail);
}
function open(id){
 if(!labels[id])return;
 var overlay=$('hub-overlay');if(!overlay)return;
 empty(overlay);
 var card=make('div','hub-dialog',overlay);
 var top=make('div','hub-dialog-top',card);
 make('h2','',top,labels[id]);
 var close=make('button','hub-close',top,'Fechar ×');
 close.onclick=hide;
 var body=make('div','hub-dialog-body',card);
 if(id==='sports'){
  line(body,'Fonte: ESPN (acesso público)','Atualização automática a cada 2 minutos');
  if(!scores.length)line(body,'Sem jogos disponíveis',scoreErrors.join(' | ')||'Nenhum evento encontrado.');
  for(var i=0;i<scores.length&&i<16;i++)line(body,scores[i].title+' · '+scores[i].score,scores[i].league+' · '+scores[i].status+' · '+prettyDate(scores[i].date));
 } else {
  var data=get(id),items=data.items||[],providers=data.providers||[];
  line(body,sourceState(id),data.error||'Última atualização: '+(lastUpdate||'—'));
  if(id==='calendar')for(var j=0;j<items.length;j++)line(body,items[j].title,prettyDate(items[j].start,items[j].all_day));
  if(id==='todoist')for(var k=0;k<items.length;k++)line(body,items[k].title,items[k].due||'Sem prazo');
  if(id==='github')for(var g=0;g<items.length;g++)line(body,items[g].title,items[g].repository||'');
  if(id==='gmail')for(var m=0;m<items.length;m++)line(body,items[m].subject,items[m].from||'');
  if(id==='ai')for(var a=0;a<providers.length;a++){
   var q=providers[a],desc=[];
   if(q.used_tokens!==undefined && q.used_tokens!==null)desc.push('Tokens observados: '+Number(q.used_tokens).toLocaleString('pt-BR'));
   if(q.remaining_percent!==undefined && q.remaining_percent!==null)desc.push('Cota restante: '+q.remaining_percent+'%');
   if(q.period)desc.push('Período: '+q.period);
   if(q.observed_at)desc.push('Medição: '+prettyDate(q.observed_at));
   if(q.source)desc.push('Fonte: '+q.source);
   line(body,q.name||'Ferramenta',desc.join(' · ')||'Sem medição');
  }
  if(data.status==='ok'&&!items.length&&!providers.length)line(body,'Nenhum registro recente','');
  if(!api){
   var btn=make('button','hub-action',body,'Configurar conexões');
   btn.onclick=configure;
  }
 }
 overlay.hidden=false;
 close.focus();
}
function hide(){var layer=$('hub-overlay');if(layer){layer.hidden=true;empty(layer);}}
function validAddress(value){
 return /^https:\/\/[^ ]+$/i.test(value) || /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?(\/[^ ]*)?$/i.test(value);
}
function configure(){
 hide();
 var overlay=$('hub-overlay');empty(overlay);
 var card=make('div','hub-dialog',overlay);
 make('h2','',card,'Conectar o painel');
 make('p','hub-muted',card,'Use o endereço HTTPS do gateway MateusArce. Nunca digite senhas do Google, Todoist, GitHub ou Claude na TV.');
 var urlLabel=make('label','hub-field',card);make('span','',urlLabel,'URL do gateway (HTTPS)');
 var url=make('input','',urlLabel);url.value=api;url.placeholder='https://painel.seudominio.com';
 var keyLabel=make('label','hub-field',card);make('span','',keyLabel,'Chave de leitura do painel');
 var secret=make('input','',keyLabel);secret.type='password';secret.value=key;secret.placeholder='Chave exclusiva da TV';
 var status=make('p','hub-error',card,'');
 var actions=make('div','hub-actions',card);
 var save=make('button','hub-action',actions,'Salvar e sincronizar');
 var cancel=make('button','hub-secondary',actions,'Cancelar');
 var remove=make('button','hub-secondary',actions,'Desconectar');
 save.onclick=function(){
  var u=url.value.replace(/^\s+|\s+$/g,'').replace(/\/+$/,'');
  var secretValue=secret.value.replace(/^\s+|\s+$/g,'');
  if(!validAddress(u)||!secretValue){status.textContent='Informe uma URL HTTPS válida e uma chave de leitura. HTTP somente na rede privada.';return;}
  api=u;key=secretValue;
  try{localStorage.setItem(root+'url',api);localStorage.setItem(root+'key',key);}catch(e){}
  hide();sync();
 };
 cancel.onclick=hide;
 remove.onclick=function(){api='';key='';snapshot=null;
  try{localStorage.removeItem(root+'url');localStorage.removeItem(root+'key');}catch(e){}
  hide();render();
 };
 overlay.hidden=false;
 url.focus();
}
function init(){
 var layer=make('div','',document.body);layer.id='hub-overlay';layer.hidden=true;
 layer.addEventListener('keydown',function(e){
  var k=e.keyCode||e.which;
  if(k===27||k===461||k===10009){hide();e.preventDefault();e.stopPropagation();return;}
  if(k===13&&e.target&&e.target.tagName==='INPUT'){
   if(e.target.type==='password'){var buttons=layer.querySelectorAll('button');if(buttons[0])buttons[0].click();}
   else {var password=layer.querySelector('input[type=password]');if(password)password.focus();}
   e.preventDefault();e.stopPropagation();return;
  }
  e.stopPropagation();
 },true);
 renderScores();render();readScores();sync();
 setInterval(readScores,120000);setInterval(sync,120000);
}
window.IntegrationHub={open:open,configure:configure,refresh:function(){readScores();sync();},isConfigured:function(){return !!api;}};
init();
})(window,document);