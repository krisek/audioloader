
ng build --base-href /static/ --output-hashing none
cd dist/audioloader/
rsync -avz --delete --exclude assets/app-config.json . ../../../../app/static/
