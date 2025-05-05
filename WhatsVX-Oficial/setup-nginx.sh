#!/bin/bash

# Instalar Nginx
apt-get install -y nginx

# Copiar configuração do Nginx
cp nginx.conf /etc/nginx/sites-available/sistema.clerky.com.br

# Criar link simbólico
ln -s /etc/nginx/sites-available/sistema.clerky.com.br /etc/nginx/sites-enabled/

# Testar configuração
nginx -t

# Reiniciar Nginx
systemctl restart nginx 