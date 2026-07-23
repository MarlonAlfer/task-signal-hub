## Objetivo
Suportar 3 idiomas na aplicação: Português (padrão), Inglês e Espanhol, com um seletor visível no cabeçalho.

## Abordagem
Usar `react-i18next` — biblioteca padrão, leve, com detecção e persistência de idioma no `localStorage`.

## O que será feito

1. **Instalar dependências**: `i18next`, `react-i18next`, `i18next-browser-languagedetector`.

2. **Criar arquivos de tradução** em `src/i18n/`:
   - `pt.json` (padrão — traduções extraídas do código atual)
   - `en.json` (inglês)
   - `es.json` (espanhol)
   - `index.ts` (inicialização do i18next)

3. **Cobertura de strings** — todas as interfaces do usuário:
   - Cabeçalho / navegação (Dashboard, Prazos, Histórico, Admin, Sair, Perfil)
   - Dashboard: categorias, badges "Hoje", estados semáforo (Pendente/Em andamento/Concluída), progresso, observações, tarefas extras, celebração
   - Prazos, Histórico, Admin (formulários, botões, colunas)
   - Autenticação (`/auth`): labels, mensagens, toasts
   - PendingGate, DeadlineAlerts, GroupNote, BackgroundMusic
   - Toasts e mensagens de erro

4. **Seletor de idioma** no cabeçalho: dropdown compacto com 🇵🇹 PT / 🇬🇧 EN / 🇪🇸 ES, persistido em `localStorage`.

5. **Formatação de datas**: usar o `locale` correspondente (`pt-PT`, `en-US`, `es-ES`) em `toLocaleDateString`.

6. **Alertas de voz** (`siren.ts` / `tts.functions.ts`): a frase falada e o `instructions` do TTS passam a variar por idioma ativo — "Alerta de prazo." / "Deadline alert." / "Alerta de plazo.".

## Detalhes técnicos
- Import de `useTranslation()` nos componentes; chaves organizadas por área (`common.*`, `dashboard.*`, `deadlines.*`, `auth.*`, etc.).
- Idioma inicial detectado por `localStorage` → `navigator.language` → fallback `pt`.
- O idioma é lido no cliente; SSR usa o fallback e o React re-renderiza após hidratação (evita mismatch usando `<ClientOnly>` apenas no seletor).
- Nomes de tarefas cadastradas no banco (títulos da lista de manutenção) permanecem no idioma em que foram gravadas — só a UI é traduzida. Isso será explicado no seletor via tooltip.

## Fora de escopo
- Traduzir conteúdo dinâmico do banco (títulos de tarefas, notas, observações escritas pelo usuário).
- Emails / notificações externas.
