expect -c 'spawn sftp juxly@ftp.healthsouth.com;expect "password";send "TX^$&GT45yLS\r";expect "sftp>";send "put /home/ec2-user/logs/*.csv\r";expect "sftp>";send "exit\r";'
## remove after sent, retain for backup
mv /home/ec2-user/logs/*.csv /home/ec2-user/copyLogs