# Usar Node.js LTS como imagem base
FROM node:18-alpine

# Criar diretório da aplicação
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar código fonte
COPY . .

# Expor porta da aplicação
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["npm", "start"] 