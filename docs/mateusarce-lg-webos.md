# mateusarce.dev Launcher para LG webOS

Implementação personalizada da tela criada no Claude, no fork **mateusarcedev/free-my-tv**.

A versão LG é um **aplicativo webOS**, não um Android APK. Ela usa o `TV`
do Free My TV (`web/tv.js`), com o barramento Luna para descobrir/abrir
aplicativos e fontes HDMI quando o firmware autoriza.

## Fidelidade ao design

O layout reproduz a identidade do protótipo fornecido:
- tela virtual **1920 × 1080**, escalada sem distorção;
- fundo escuro `#0e0e0e`, verde-mint `#15F5BA`, bordas finas e grade de 64px;
- cabeçalho a 64px, margens laterais de 112px, relógio grande, hero de 268px;
- doca com cartões, estado de foco, blocos de calendário, tarefas e integrações;
- tipografia Geist e Geist Mono extraível do HTML do proprietário.

**Importante:** é um **port de interface**, não uma incorporação pixel a
pixel do runtime do Claude. Isso mantém o código independente de um framework
web moderno que pode nem executar no Chromium antigo de algumas TVs LG.
A fidelidade final à fonte e às animações deve ser validada no modelo real.

O launcher **não se torna a Home nativa** da LG. Instale como app e associe
um número do controle (com ele aberto, segure uma tecla numérica).

## Preparação e build

No Windows, use PowerShell com Python 3 e OpenSSH disponíveis.

Clone o **seu fork** e selecione esta branch:

```powershell
git clone https://github.com/mateusarcedev/free-my-tv.git
cd free-my-tv
git checkout feat/lg-mateusarce-design
```

Opcional, para usar **as fontes originais do seu design** sem commitá-las:
```powershell
py tools/import_mateusarce_fonts.py "C:\caminho\TV Launcher.html"
```

Build independente da versão Android e do app original:
```powershell
py webos/build.py --mateusarce --generic --preview
```

Arquivos gerados:
- `MateusArceTV-webos.ipk` — instalar na LG
- `out/mateusarce-webos/index.html` — prévia em navegador de PC

`--generic` evita exigir chave TMDB ou criar um `config.properties`.
O port não depende de TMDB para mostrar a home.

## Instalar na LG

1. Instale **Developer Mode** pela loja da LG e entre com sua conta de desenvolvedor.
2. Ative **Dev Mode Status** e **Key Server**. Reinicie conforme solicitado pela TV.
3. Consulte o endereço IP da TV, na mesma rede do computador.
4. Instale o APK? **Não:** é um `.ipk` webOS. Execute:

```powershell
py webos/install.py 192.168.1.50 --mateusarce
```

Substitua o IP pelo endereço da sua TV. Na primeira vez será solicitada a
passphrase que a TV exibe; nunca compartilhe essa credencial.

Para remover **apenas a versão personalizada**:
```powershell
py webos/install.py 192.168.1.50 --mateusarce --uninstall
```

A versão personalizada possui ID `io.mateusarce.tvhome` e
pode coexistir com o Free My TV original `io.freemytv`.

## Controles e funcionalidades

| Ação | Resultado |
|---|---|
| Setas / OK | Navega e abre aplicativos disponíveis |
| Voltar | Fecha painel ou retorna ao estado inicial |
| Entradas | Consulta e abre HDMI/TV pela API Luna disponível |
| Configurações | Abre o sistema e muda tema, widgets e animações |
| Organizar | OK pega um item da doca; esquerda/direita move; OK confirma |
| Tarefas | Registro local somente neste aparelho (até 5) |
| Calendário | **Data real local**, sem sincronização com contas |
| Placar / e-mail / GitHub | Indisponíveis até haver integração de dados autenticada |

Se `listLaunchPoints` for negado pelo firmware da LG, a interface mostra
**atalhos sugeridos não verificados**. Alguns podem não estar instalados.
O status de conexão de HDMI também pode ser desconhecido em certos firmwares.

A fonte Geist é opcional no build: sem importação local, o CSS recua para
fontes disponíveis no webOS, perdendo parte da fidelidade.

### Testes recomendados

- Navegar com D-pad **e Magic Remote**, abrir Netflix/YouTube instalados.
- Testar entradas HDMI reais e retornar pelo controle.
- Alterar ordem da doca e reiniciar o app para verificar persistência.
- Validar foco, legibilidade, overscan e escala em 1080p/4K.
- Testar a tela sem internet e com Dev Mode ainda válido.
- Confirmar a versão exata de webOS/Chromium: webOS 3/4 pode limitar CSS
  e permissões Luna, e não há garantia de compatibilidade sem teste físico.

A versão Android do CleanYourTV é mantida separada, sem migração de arquivos
ou PR entre os repositórios.
