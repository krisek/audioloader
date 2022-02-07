FROM docker.io/python:3.9-slim-bullseye AS build
#RUN apk add --update-cache uwsgi-python3

ENV LANG en_EN.UTF-8
ENV LANGUAGE en_EN
ENV LC_ALL C.UTF-8
ENV TZ=Europe/Budapest
ENV DEBIAN_FRONTEND=noninteractive 

ENV SUDO_FORCE_REMOVE yes

RUN apt update && apt install -y gcc python3-dev libxml2 libxslt1.1 libxml2-dev libxslt1-dev 
RUN pip install lxml
RUN tar zcvf /tmp/lxml.tgz `find /usr/local -xdev -newermt $(date +%Y-%m-%d -d '1 hour ago') -not -name *.pyc -type f -print` 

FROM docker.io/python:3.9-slim-bullseye
COPY --from=build /tmp/lxml.tgz /tmp/
RUN tar zxf /tmp/lxml.tgz

RUN apt update && apt install -y  uwsgi-plugin-python3 libxml2 libxslt1.1 

COPY audioloader /var/lib/audioloader
RUN pip install -r /var/lib/audioloader/requirements.txt
RUN mkdir /var/lib/mpf/; useradd al; cp /var/lib/audioloader/app.container.ini /var/lib/audioloader/app.ini; chown -R al:al /var/lib/audioloader; chown -R al:al /var/lib/mpf; touch /var/lib/audioloader/.reload
USER al
CMD ["uwsgi","--ini","/var/lib/audioloader/app.ini"] 


