# MCP Server — Supabase SQL + Edge Functions

Servidor MCP para executar SQL no Supabase e gerenciar Edge Functions via SSH na VPS.

## Pré-requisitos no banco

Crie a função RPC `execute_sql` no seu Supabase:

```sql
CREATE OR REPLACE FUNCTION execute_sql(p_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  rows_json JSONB := '[]'::JSONB;
  v_clean_query TEXT;
  v_first_word TEXT;
BEGIN
  -- 1) Remove comentários de bloco /* ... */
  v_clean_query := regexp_replace(p_query, '/\*.*?\*/', '', 'g');
  -- 2) Remove comentários de linha -- ...
  v_clean_query := regexp_replace(v_clean_query, '--[^\n]*', '', 'g');
  -- 3) Remove whitespace do início/fim (espaços, \n, \t, \r)
  v_clean_query := trim(both E' \n\r\t' from v_clean_query);
  v_first_word := upper(split_part(v_clean_query, ' ', 1));

  IF v_first_word IN ('SELECT', 'WITH') THEN
    FOR rec IN EXECUTE p_query LOOP
      rows_json := rows_json || to_jsonb(rec);
    END LOOP;
    RETURN jsonb_build_object(
      'command', v_first_word,
      'rowCount', jsonb_array_length(rows_json),
      'rows', rows_json
    );
  END IF;

  EXECUTE p_query;
  RETURN jsonb_build_object(
    'command', v_first_word,
    'success', true,
    'message', 'Query executada com sucesso'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'command', v_first_word,
    'success', false,
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$$;

-- Somente a service_role pode executar. O Supabase concede EXECUTE a anon e
-- authenticated por padrão em funções do schema public, por isso o REVOKE.
REVOKE EXECUTE ON FUNCTION execute_sql(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION execute_sql(TEXT) TO service_role;
```

> 🚨 **Nunca** conceda `execute_sql` a `anon` ou `authenticated`: a função é `SECURITY DEFINER` e executa SQL arbitrário. Com a anon key (pública no frontend), qualquer pessoa teria controle total do banco.

## Setup

```bash
cd mcp-server
copy .env.example .env
# Edite .env com seus dados
npm install
npm start
```

## Variáveis de ambiente (.env)

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_KEY=sua-service-role-key
READ_ONLY=true
```

> ⚠️ Use a **Service Role Key** (nunca a Anon Key no frontend). Encontre em: Supabase Dashboard > Project Settings > API > service_role.

### Modo somente leitura (`READ_ONLY`)

Ativo por padrão — só é desligado com `READ_ONLY=false`. Com ele ativo:

- `execute_sql` aceita apenas `SELECT`/`WITH`, e a RPC é chamada via GET, o que faz o PostgREST executá-la em transação `READ ONLY` (bloqueia também CTEs com `DELETE`, funções que alteram dados etc.)
- As ferramentas de escrita ficam ocultas e bloqueadas: `deploy_edge_function`, `deploy_local_edge_function`, `delete_edge_function`, `restart_edge_functions`, `invoke_edge_function`, `deploy_local_function` e `apply_local_migration`

## Ferramentas disponíveis

| Ferramenta | Descrição |
|------------|-----------|
| `execute_sql` | Executa qualquer query SQL via RPC |
| `list_tables` | Lista tabelas do schema `public` |
| `describe_table` | Retorna colunas e tipos de uma tabela |
| `query_table` | SELECT * com limite de 100 linhas |
| `list_edge_functions` | Lista Edge Functions deployadas na VPS |
| `deploy_edge_function` | Deploya código passado como string |
| `deploy_local_edge_function` | **Lê arquivo local e deploya** (recomendado) |
| `delete_edge_function` | Remove uma Edge Function |
| `get_edge_function_logs` | Logs do container functions |
| `restart_edge_functions` | Reinicia o serviço functions |
| `invoke_edge_function` | Invoca via HTTP POST para testar |

## Conectar no Kimi / Claude / Cursor

### Kimi CLI

Edite `%APPDATA%\Kimi\mcp.json` (Windows) ou `~/.kimi/mcp.json` (Mac/Linux):

```json
{
  "mcpServers": {
    "supabase-mcp": {
      "command": "node",
      "args": [
        "C:\\caminho\\para\\mcp-server\\index.js"
      ]
    }
  }
}
```

### Claude Desktop

Edite `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "supabase-mcp": {
      "command": "node",
      "args": ["/caminho/para/mcp-server/index.js"]
    }
  }
}
```

## Segurança

- O `.env` está no `.gitignore` — credenciais não são commitadas
- O servidor roda **localmente** na sua máquina
- Use a `SERVICE_ROLE_KEY` com cautela — ela bypassa RLS
