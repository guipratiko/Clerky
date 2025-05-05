#!/bin/bash

# Atualizar o sistema
apt-get update
apt-get upgrade -y

# Instalar Docker e Docker Compose
apt-get install -y docker.io docker-compose

# Criar diretório do projeto
mkdir -p /var/www/clerky
cd /var/www/clerky

# Remover conteúdo existente se houver
rm -rf *

# Clonar o repositório
git clone https://github.com/guipratiko/Clerky.git .

# Copiar arquivo de ambiente
cp .env.example .env

# Construir e iniciar os containers
docker-compose up -d --build

# Verificar status dos containers
docker-compose ps 