#!/bin/bash

# Dar permissão de execução aos scripts
chmod +x deploy.sh
chmod +x setup-nginx.sh

# Executar scripts
./deploy.sh
./setup-nginx.sh

echo "Instalação concluída! Acesse http://sistema.clerky.com.br" 