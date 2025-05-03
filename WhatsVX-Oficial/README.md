# WhatsVX - Sistema de Automação de Mensagens para WhatsApp

WhatsVX é uma aplicação web completa para automação de envio de mensagens em massa via WhatsApp, permitindo a criação de templates personalizados, campanhas de mensagens e gestão de contatos.

## Funcionalidades

### Gestão de Templates
- **Templates Variados**: Crie modelos com textos, imagens, áudios, arquivos e mensagens mistas
- **Personalização**: Use variáveis como {nome} para personalizar mensagens
- **Gerenciamento de Mídia**: Upload e gerenciamento de imagens, áudios e arquivos
- **Visualização**: Interface interativa para visualizar modelos antes de usar
- **Áudios como Mensagem de Voz**: Opção para enviar áudios como mensagens de voz (aparecem como gravações no WhatsApp)

### Campanhas de Mensagens
- **Gestão Completa**: Crie, edite, pause, reinicie e cancele campanhas
- **Importação de Contatos**: Importe facilmente via arquivos CSV
- **Monitoramento em Tempo Real**: Acompanhe o progresso dos envios em tempo real
- **Estatísticas Detalhadas**: Visualize dados sobre envios, falhas e pendências

### Conexão com WhatsApp
- **Autenticação Simples**: Conecte-se facilmente escaneando um QR Code
- **Gerenciamento de Sessão**: Desconecte ou reconecte quando necessário
- **Verificação de Números**: Sistema identifica números válidos do WhatsApp
- **Proteção Contra Bloqueios**: Pausas estratégicas para evitar banimentos

### Interface de Usuário
- **Design Responsivo**: Interface moderna com Bootstrap 5
- **Painéis Intuitivos**: Navegação simples e organizada
- **Notificações em Tempo Real**: Receba atualizações instantâneas via Socket.IO
- **Feedback Visual**: Alertas claros sobre sucesso ou falha nas operações

## Estrutura do Projeto

```
whatsvx/
├── config/             # Configurações (banco de dados, etc.)
├── controllers/        # Controladores da aplicação
│   ├── campanhaController.js    # Gerenciamento de campanhas
│   ├── templateController.js    # Gerenciamento de templates
│   └── whatsappController.js    # Conexão e envio via WhatsApp
├── models/             # Modelos de dados
│   ├── Campanha.js     # Modelo de campanha
│   └── Template.js     # Modelo de template
├── public/             # Arquivos estáticos
│   ├── css/            # Estilos CSS
│   ├── js/             # Scripts JavaScript
│   └── exemplos/       # Arquivos de exemplo para o usuário
├── routes/             # Rotas da aplicação
│   └── index.js        # Definição de rotas
├── uploads/            # Arquivos enviados pelos usuários
│   └── contatos/       # Arquivos CSV de contatos
├── views/              # Templates de visualização (EJS)
│   ├── layouts/        # Layouts compartilhados
│   ├── campanhas.ejs   # Lista de campanhas
│   ├── detalhes-campanha.ejs # Detalhes de uma campanha
│   ├── index.ejs       # Dashboard inicial
│   ├── templates.ejs   # Gestão de templates
│   └── whatsapp.ejs    # Conexão com WhatsApp
├── .env                # Variáveis de ambiente
├── index.js            # Ponto de entrada da aplicação
├── package.json        # Dependências do projeto
└── README.md           # Documentação
```

## Requisitos

- Node.js 14 ou superior
- MongoDB 4.4 ou superior
- Conexão com internet
- Número de WhatsApp ativo

## Instalação

1. Clone o repositório:
   ```
   git clone https://github.com/seu-usuario/whatsvx.git
   cd whatsvx
   ```

2. Instale as dependências:
   ```
   npm install
   ```

3. Configure as variáveis de ambiente criando um arquivo `.env` na raiz do projeto:
   ```
   PORT=3000
   MONGO_URI=mongodb://localhost:27017/whatsvx
   SESSION_SECRET=seu_segredo_aqui
   ```

4. Crie as pastas necessárias:
   ```
   mkdir -p uploads/contatos
   ```

5. Inicie o servidor:
   ```
   node index.js
   ```

6. Acesse a aplicação em `http://localhost:3000`

## Guia de Uso

### 1. Conexão com WhatsApp
1. Acesse a página "WhatsApp" no menu lateral
2. Escaneie o QR Code com seu WhatsApp no celular
3. Aguarde até que a conexão seja estabelecida
4. O status mudará para "Conectado" quando estiver pronto

### 2. Criação de Templates
1. Acesse a página "Templates" no menu lateral
2. Clique em "Novo Template"
3. Escolha o tipo de template (texto, imagem, áudio, arquivo ou misto)
4. Preencha o conteúdo e faça upload de arquivos conforme necessário
5. Para templates de áudio, selecione se deseja enviar como "Áudio Normal" ou "Mensagem de Voz"
6. Salve o template

### 3. Criação de Campanhas
1. Acesse a página "Campanhas" no menu lateral
2. Clique em "Nova Campanha"
3. Dê um nome à campanha e selecione um template
4. Após a criação, você será redirecionado para os detalhes da campanha

### 4. Importação de Contatos
1. Na página de detalhes da campanha, clique em "Upload de Contatos CSV"
2. Selecione um arquivo CSV com colunas "numero" ou "telefone" (obrigatório) e "nome" (opcional)
3. Os números devem estar no formato internacional (ex: 5511999999999)
4. Clique em "Enviar" para realizar o upload

### 5. Envio de Mensagens
1. Na página de detalhes da campanha, clique em "INICIAR DISPARO"
2. O sistema verificará se os números existem no WhatsApp
3. As mensagens serão enviadas com pausas estratégicas para evitar bloqueios
4. Você pode acompanhar o progresso em tempo real
5. A campanha será automaticamente marcada como "Concluída" quando terminar

## Características Técnicas

- **Framework Backend**: Express.js para API RESTful
- **Banco de Dados**: MongoDB com Mongoose para modelagem de dados
- **Frontend**: EJS com Bootstrap 5 para interface responsiva
- **WhatsApp API**: whatsapp-web.js para comunicação com WhatsApp
- **WebSockets**: Socket.IO para atualizações em tempo real
- **Upload de Arquivos**: Multer para processamento de uploads
- **Processamento CSV**: csvtojson para leitura de arquivos CSV

## Sistema Anti-Bloqueio

O WhatsVX implementa um sistema inteligente para evitar bloqueios pelo WhatsApp:

- **Verificação de números**: Antes de enviar, verifica se o número existe no WhatsApp
- **Pausas aleatórias**: 60-72 segundos entre envios (tempo variável)
- **Pausas longas**: 10 minutos de pausa a cada 10 mensagens enviadas
- **Processamento em lotes**: Máximo de 100 mensagens por vez

## Considerações Importantes

- **Termos de Serviço do WhatsApp**: Este sistema deve ser usado respeitando os termos de serviço do WhatsApp
- **Legislação**: Certifique-se de estar em conformidade com as leis de privacidade e comunicação do seu país
- **Uso Ético**: Envie mensagens apenas para contatos que consentiram em recebê-las
- **Evite Spam**: O envio excessivo de mensagens pode resultar em bloqueio da sua conta

## Solução de Problemas

- **QR Code expira**: Atualize a página para gerar um novo QR Code
- **Erro ao enviar mensagem**: Verifique se o WhatsApp está conectado e se o número está no formato correto
- **Arquivos não são enviados**: Certifique-se de que os arquivos foram corretamente carregados no template
- **Interface não atualiza**: Tente recarregar a página ou verificar a conexão de internet

## Licença

Este projeto está licenciado sob a licença MIT - consulte o arquivo LICENSE para obter detalhes.

## Aviso Legal

Este software é fornecido "como está", sem garantias expressas ou implícitas. Os autores não são responsáveis por uso indevido ou quaisquer consequências resultantes do uso deste software. 