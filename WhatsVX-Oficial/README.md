# Clerky

Sistema de automação e gerenciamento de WhatsApp com integração n8n.

## Funcionalidades

- Conexão com WhatsApp Web
- Envio e recebimento de mensagens
- Integração com n8n para automação
- Gerenciamento de campanhas
- Interface web para controle

## Requisitos

- Node.js 14+
- MongoDB
- WhatsApp Web
- n8n (opcional, para automação)

## Instalação

1. Clone o repositório:
```bash
git clone https://github.com/guipratiko/Clerky.git
cd Clerky
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

4. Inicie o servidor:
```bash
node index.js
```

## Configuração

1. Acesse a interface web em `http://localhost:3000`
2. Faça login com suas credenciais
3. Escaneie o QR Code com seu WhatsApp
4. Configure a integração com n8n (opcional)

## Uso

- Envio de mensagens individuais
- Gerenciamento de campanhas
- Automação via n8n
- Monitoramento em tempo real

## Contribuição

Contribuições são bem-vindas! Por favor, abra uma issue ou envie um pull request.

## Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes. 