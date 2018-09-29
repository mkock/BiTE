#!/usr/bin/env bash

# Update Debian packages
sudo apt-get -y update
sudo apt-get -y install curl
cd /bite

# Ensure that .bash_profile contains correct locale setting for MongoDB
if [ ! -f /home/vagrant/.bash_profile ]; then
    touch /home/vagrant/.bash_profile
fi
sudo chown vagrant:vagrant /home/vagrant/.bash_profile
if ! grep -q "LC_ALL" /home/vagrant/.bash_profile; then
    echo "export LC_ALL=\"en_US.UTF-8\"" > /home/vagrant/.bash_profile
fi

# Install MongoDB
if ! hash mongo 2>/dev/null; then
  curl -O https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-2.6.7.tgz
  tar -zvxf mongodb-linux-x86_64-2.6.7.tgz
  ln -fs /bite/mongodb-linux-x86_64-2.6.7 /bite/mongodb
  ln -fs /bite/mongodb/bin/mongo /usr/bin/
  ln -fs /bite/mongodb/bin/mongod /usr/bin/
  rm *.tgz
fi

# Install redis
if ! hash redis-server 2>/dev/null; then
  curl -O http://download.redis.io/releases/redis-2.8.19.tar.gz
  tar -zvxf redis-2.8.19.tar.gz
  cd redis-2.8.19
  make
  ln -fs /bite/redis-2.8.19/src/redis-server /usr/bin/
  ln -fs /bite/redis-2.8.19/src/redis-cli /usr/bin/
  cd ..
  rm *.tar.gz
fi

# Install nodejs
if ! hash node 2>/dev/null; then
  curl -O http://nodejs.org/dist/v0.10.36/node-v0.10.36-linux-x64.tar.gz
  tar -zvxf node-v0.10.36-linux-x64.tar.gz
  ln -fs /bite/node-v0.10.36-linux-x64 /bite/node
  ln -fs /bite/node/bin/node /usr/bin/
  ln -fs /bite/node/bin/npm /usr/bin/
  rm *.tar.gz
fi

# Install bower globally
if ! hash bower 2>/dev/null; then
  sudo /usr/bin/npm install -g bower
fi

# Create db data directory
sudo mkdir -p /home/vagrant/data/db
sudo chown -R vagrant:vagrant /home/vagrant/data/db
sudo chmod -R 0755 /home/vagrant/data
