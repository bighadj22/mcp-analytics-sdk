export function createServerConfig(ctx: DurableObjectState, env: any) {
  const userProvidedName = env?.MCP_SERVER_NAME
  const automaticName = ctx.id.name
  
  return {
    serverName: userProvidedName || automaticName || 'MCP Server',
    serverVersion: env?.MCP_SERVER_VERSION || '1.0.0',
    environment: env?.ENVIRONMENT || 'production'
  }
}