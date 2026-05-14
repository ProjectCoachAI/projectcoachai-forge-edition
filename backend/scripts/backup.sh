#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
BACKUP_FILE="$BACKUP_DIR/forge_backup_$TIMESTAMP.sql"
mkdir -p $BACKUP_DIR
echo "Starting backup: $BACKUP_FILE"
pg_dump $DATABASE_URL > $BACKUP_FILE
if [ $? -eq 0 ]; then
  echo "Backup successful: $BACKUP_FILE"
  ls -t $BACKUP_DIR/*.sql | tail -n +8 | xargs rm -f
else
  echo "Backup FAILED"
  exit 1
fi
