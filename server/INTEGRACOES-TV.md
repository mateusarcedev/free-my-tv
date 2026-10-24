# MateusArce TV — integrações de verdade

A interface atual foi preservada. O app busca placares do Brasileirão,
Champions League e NBA na API pública (não oficial) de placares da ESPN
a cada dois minutos. Depende de TLS/CORS e disponibilidade da ESPN.
Sem resposta, a tela informa a falha — não gera números fictícios.

O gateway Python é um backend **somente leitura** para Google Calendar,
Gmail, Todoist, GitHub e medições de IA. Credenciais dos provedores
ficam SOMENTE no servidor; o aplicativo recebe dados reduzidos.

## 1. Inicie o gateway Python 3.10+

Na máquina que vai hospedar o serviço:

~~~bash
cp server/gateway.example.env server/gateway.env
chmod 600 server/gateway.env
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
~~~

Copie a chave forte gerada para GATEWAY_KEY no arquivo gateway.env.
A chave deve ter 24 caracteres ou mais. Então execute:

~~~bash
set -a
source server/gateway.env
set +a
python3 server/tv_gateway.py
~~~

Para validar a API no mesmo terminal, abra outra sessão, carregue as
variáveis e teste:

~~~bash
curl -i http://127.0.0.1:18777/health
curl -i -H "X-Dashboard-Key: $GATEWAY_KEY" \
  http://127.0.0.1:18777/v1/dashboard
~~~

Fontes ainda não autorizadas retornam status unconfigured. Sem chave ou
com chave incorreta, a API devolve HTTP 401. O gateway escuta apenas em
127.0.0.1 por padrão. **Não exponha diretamente a porta 18777 à Internet.**
Publique por um reverse proxy HTTPS, com certificado válido e firewall
(Caddy, Traefik, Nginx), apontando para 127.0.0.1:18777.

Exemplo Caddy (substituir domínio):

~~~caddyfile
tv.seudominio.com {
    reverse_proxy 127.0.0.1:18777
}
~~~

Na LG, abra Configurações > Conectar integrações e digite a URL HTTPS
do gateway e sua GATEWAY_KEY. Nunca digite ali senhas, refresh tokens do
Google, tokens GitHub ou Todoist. O serviço faz cache de 120 segundos.
Os dados no launcher são atualizados a cada 2 minutos.

## 2. Google Calendar e Gmail

Crie um projeto no Google Cloud, habilite as APIs Google Calendar e Gmail,
configure a tela de consentimento OAuth com sua conta como usuária de teste
se necessário e crie um cliente OAuth do tipo Desktop app.

No seu PC (ou no ambiente com navegador disponível):

~~~bash
export GOOGLE_CLIENT_ID='seu-client-id'
export GOOGLE_CLIENT_SECRET='seu-client-secret'
python3 server/google_oauth_setup.py
~~~

O script abre uma autorização em localhost e solicita somente Calendar Events
read-only e Gmail read-only. Guarde GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
e GOOGLE_REFRESH_TOKEN na configuração privada do gateway.

O calendário consulta os próximos 14 dias (até 12 eventos).
O Gmail mostra o contador de mensagens não lidas na Caixa de Entrada
e remetente/assunto das 6 mensagens recentes. Não lê corpos de e-mails
nem tem permissão de enviar ou excluir. Outlook/IMAP precisa de adaptador.

## 3. Todoist

Em Configurações > Integrações > Desenvolvedor do Todoist, copie seu
token de API para TODOIST_API_TOKEN no gateway.env. O gateway faz GET
/api/v1/tasks, até 20 tarefas. É um painel de leitura, sem criar,
editar ou concluir tarefas por enquanto.

## 4. GitHub

Com GITHUB_USERNAME=mateusarcedev, mostra repositórios públicos.
Para notificações da conta, preencha GITHUB_TOKEN com permissões mínimas
para ler notificações. Não modifica repositórios. O contador corresponde
ao máximo de 10 notificações buscadas, NÃO ao total histórico.

## 5. Claude Code, Codex e Google Antigravity

O gateway lê medições OBSERVADAS de um arquivo JSON privado indicado por
AI_USAGE_JSON, localizado na máquina do gateway.

Formato de exemplo (VALORES FICTÍCIOS PARA DOCUMENTAR O ESQUEMA):

~~~json
{
  "providers": [
    {
      "name": "Claude Code",
      "period": "sessão local",
      "used_tokens": 12345,
      "observed_at": "2026-10-23T18:00:00-04:00",
      "source": "logs locais"
    }
  ]
}
~~~

Não use o exemplo como medição real. Um coletor precisa gerar esse
arquivo com os dados reais de Claude Code, Codex e Antigravity.
Tokens consumidos localmente e limites restantes da assinatura são
medidas DIFERENTES. A disponibilidade de cotas oficiais depende de
cada ferramenta. Se seu OpenCode Usage Bridge roda em 127.0.0.1:18765
no seu PC e o gateway fica na VPS, NÃO exponha a porta à Internet:
use um coletor local com exportação segura ou túnel autenticado e
valide primeiro o formato do bridge.

## 6. Compilar e instalar na TV

~~~bash
cd ~/projetos/free-my-tv
git switch main
git pull --ff-only origin main
python3 -m py_compile server/tv_gateway.py server/google_oauth_setup.py
rm -f MateusArceTV-webos.ipk
python3 webos/build.py --mateusarce --generic &&
python3 webos/install.py 192.168.100.24 --mateusarce
~~~

O Free My TV original permanece instalado, separado do MateusArce TV.
A instalação não autoriza contas automaticamente e não substitui a Home
nativa do webOS.

## Cuidados

- HTTPS obrigatório ao publicar na Internet; proteja chave e tokens.
- O token da TV é uma chave de LEITURA do gateway, armazenada na TV.
- Uma pessoa com acesso físico à TV e à chave poderá consultar esse painel.
- A integração local não usa as conexões já estabelecidas no ChatGPT.
- Nunca faça commit de gateway.env nem de snapshots privados de IA.
- webOS antigo pode bloquear CORS, TLS ou o domínio da ESPN.
