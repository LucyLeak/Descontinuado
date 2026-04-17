# Descontinuado

Terminal narrativo para ARG com visual CRT vermelho, glitch/VHS e respostas controladas por um banco de dados em JSON.

## Estrutura

- `index.html`: interface minima do terminal.
- `styles.css`: tema vermelho, responsividade, scanlines e distorcao visual.
- `script.js`: motor do chat, leitura do JSON, memoria local e animacoes de digitacao/correcao.
- `data/responses.json`: banco principal de respostas e pistas do ARG.
- `vercel.json`: headers para deploy estatico na Vercel e cache desligado no JSON de dialogo.

## Como rodar

Como o projeto busca `data/responses.json`, abra com um servidor local simples em vez de clicar direto no arquivo:

```powershell
python -m http.server 8080
```

Depois acesse `http://localhost:8080`.

## Vercel

O projeto ja esta pronto para deploy estatico na Vercel. Os assets principais usam caminhos absolutos e o `vercel.json` desliga cache do arquivo `data/responses.json`, o que ajuda quando voce atualiza o banco de respostas e sobe uma nova versao.

## Banco de respostas

O arquivo `data/responses.json` aceita respostas por texto exato, trechos, regex e flags internas. Exemplo resumido:

```json
{
  "assistantLabel": "TRANSMISSAO",
  "fallbackReplies": [
    {
      "id": "fallback-01",
      "script": [
        { "type": "text", "value": "Nada encontrado." }
      ]
    }
  ],
  "replies": [
    {
      "id": "greeting",
      "match": {
        "exact": ["ola"],
        "contains": ["bom dia"]
      },
      "setFlags": ["greeted"],
      "script": [
        { "type": "text", "value": "Oi" },
        { "type": "pause", "duration": 200 },
        { "type": "text", "value": "." },
        { "type": "pause", "duration": 120 },
        { "type": "delete", "count": 1 },
        { "type": "text", "value": "..." }
      ]
    }
  ]
}
```

## Tipos de script

- `text`: digita texto caractere por caractere.
- `pause`: espera alguns milissegundos.
- `delete`: apaga a quantidade definida de caracteres.
- `linebreak`: quebra linha.

## Match suportado

- `exact`: dispara quando a mensagem inteira bate com um termo.
- `contains`: dispara quando a frase contem um termo.
- `startsWith`: dispara quando a mensagem comeca com um termo.
- `regex`: dispara com expressao regular.
- `requiresFlags`: so responde se essas flags ja existirem.
- `excludesFlags`: bloqueia a resposta se essas flags ja existirem.
- `previousNode`: exige que a ultima resposta tenha sido um `id` especifico.

As regras mais especificas vencem as genericas. Na pratica, `exact` ganha de `startsWith`, que ganha de `contains`, que ganha de `regex`.

## Memoria

O terminal salva `flags`, ultima entrada, progresso e historico recente no `localStorage`, permitindo liberar pistas conforme a conversa evolui e restaurar a conversa apos recarregar a pagina.
