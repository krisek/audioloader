uwsgi --socket 0.0.0.0:5000 --protocol=http -w wsgi:application --enable-threads --py-autoreload 1
