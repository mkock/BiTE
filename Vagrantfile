# -*- mode: ruby -*-
# vi: set ft=ruby :

# Vagrantfile API/syntax version. Don't touch unless you know what you're doing!
VAGRANTFILE_API_VERSION = "2"

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|

    # The name of the box and url for image
    config.vm.box = "trusty64"
    config.vm.box_url = "https://oss-binaries.phusionpassenger.com/vagrant/boxes/latest/ubuntu-14.04-amd64-vbox.box"

    config.vm.boot_timeout = 1000

    # Set the node name
    config.vm.hostname = "bitedev"

    # Create a forwarded port mapping which allows access to a specific port
    # within the machine from a port on the host machine. In the example below,
    # accessing "localhost:8080" will access port 80 on the guest machine.
    config.vm.network :forwarded_port, guest: 5000, host: 8080
    config.vm.network :forwarded_port, guest: 5001, host: 8081

    config.vm.synced_folder ".", "/bite",
      id: "vagrant-root",
      owner: "vagrant",
      group: "www-data",
      mount_options: ["dmode=775,fmode=775"]

    config.vm.provision :shell, :path => "Vagrantbootstrap.sh"
end
