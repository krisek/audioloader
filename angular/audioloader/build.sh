
ng build --prod --base-href /static/ --output-hashing none
cd dist/audioloader2/
rsync -avz --delete --exclude assets/app-config.json . ../../../../app/static/
