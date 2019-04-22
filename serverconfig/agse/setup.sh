#!/bin/bash

# Air Gapped Signing Environment setup script for Debian 8.5 on BeagleBone Black


activeKeys='4'
backupKeys='21'
localAddress='10.0.0.42'
remoteAddress='10.0.0.43'
port='31337'
passwords=()


export DEBIAN_FRONTEND=noninteractive
apt-get -y --allow-downgrades update
apt-get -y --allow-downgrades upgrade
export DEBIAN_FRONTEND=text
apt-get install console-data console-setup keyboard-configuration

for i in `seq 1 ${activeKeys}` ; do
	echo -n "Password for key #${i}: "
	read passwords[${i}]
done

reset

oldhostname=$(hostname)
echo -n 'Hostname: '
read hostname
echo ${hostname} > /etc/hostname
sed -i "s|${oldhostname}|${hostname}|g" /etc/hosts

oldusername=$(ls /home)
echo -n 'Username: '
read username
echo 'FYI, login password must be under 64 characters.'
adduser ${username}
adduser ${username} admin
echo "${username} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
agseDir="/home/${username}/agse"

cat >> /etc/network/interfaces << EndOfMessage
auto eth0
iface eth0 inet static
	address ${localAddress}
	netmask 255.255.0.0
EndOfMessage

export DEBIAN_FRONTEND=noninteractive
apt-get -y --allow-downgrades update
apt-get -y --allow-downgrades install curl lsb-release apt-transport-https
apt-get -y --allow-downgrades purge apache* mysql* openssh-server
distro="$(lsb_release -c | awk '{print $2}')"
echo "deb https://deb.nodesource.com/node_10.x ${distro} main" >> /etc/apt/sources.list
curl https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add -
apt-get -y --allow-downgrades update
apt-get -y --allow-downgrades upgrade
apt-get -y --allow-downgrades install sudo nodejs ecryptfs-utils lsof

npm -g install xkcd-passphrase

mkdir -p ${agseDir}
cp "$(dirname "$0")"/* ${agseDir}/
chmod -R 777 ${agseDir}

if [ -f ${agseDir}/keybackup ] ; then
	eval "$(${agseDir}/getbackuppassword.js)"
else
	backupPasswordAes="$(xkcd-passphrase 256)"
	backupPasswordSodium="$(xkcd-passphrase 256)"
	echo "Password for backup keys is: ${backupPasswordAes} ${backupPasswordSodium}"
	echo -e '\nMemorize this and then hit enter to continue.'
	read
fi
reset


cat > ${agseDir}/setup.sh << EndOfMessage
#!/bin/bash

cd /home/${username}

npm install level libsodium-wrappers-sumo node-fetch read supersphincs@5 validator
echo

${agseDir}/generatekeys.js \
	"${activeKeys}" \
	"${backupKeys}" \
	"$(ls ${agseDir}/keybackup 2> /dev/null)" \
	"${passwords[1]}" \
	"${passwords[2]}" \
	"${passwords[3]}" \
	"${passwords[4]}" \
	"${backupPasswordAes}" \
	"${backupPasswordSodium}"

if [ ! -f ${agseDir}/keybackup ] ; then
	echo
	echo -n "Before committing, you must validate that the SHA-512 of "
	echo -n "the public key JSON you've been emailed matches the above."
	echo
	echo -n "Hit enter to continue after you've either done so or "
	echo -n "written down the hash for validation at a later time."
	echo
	read
fi

mv ${agseDir}/server.js ./


cat >> .bashrc <<- EOM
	if [ -f /autostart ] ; then
		if [ -d /home/${oldusername} ] ; then
			sudo deluser --remove-home ${oldusername}
		fi

		setterm -blank 0

		sleep 5
		sudo service networking restart 2> /dev/null
		sudo systemctl daemon-reload 2> /dev/null

		while [ ! "\\\$(node -e 'console.log(
			(os.networkInterfaces().eth0 || []).filter(o =>
				o.address === "${localAddress}"
			)[0] || ""
		)')" ] ; do
			sleep 1
		done

		./server.js "${activeKeys}" "${localAddress}" "${remoteAddress}" "${port}"
	fi
EOM
EndOfMessage
chmod 777 ${agseDir}/setup.sh


su ${username} -c ${agseDir}/setup.sh
rm -rf ${agseDir}

modprobe ecryptfs
ecryptfs-migrate-home -u ${username}
su ${username} -c echo
rm -rf /home/${username}.*
touch /autostart
chmod 444 /autostart

echo 'Setup complete; hit enter to shut down now.'
read
halt
