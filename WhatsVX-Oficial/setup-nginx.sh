#!/bin/bash

# Instalar Nginx
apt-get install -y nginx

# Copiar configuração do Nginx
cp nginx.conf /etc/nginx/sites-available/sistema.clerky.com.br

# Criar link simbólico
ln -s /etc/nginx/sites-available/sistema.clerky.com.br /etc/nginx/sites-enabled/

# Dar permissões corretas ao diretório do projeto
chown -R www-data:www-data /var/www/clerky
chmod -R 755 /var/www/clerky

# Testar configuração
nginx -t

# Reiniciar Nginx
systemctl restart nginx 