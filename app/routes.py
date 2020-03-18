from app import app
import requests
from requests.packages import urllib3
import re
import json
from flask import Response
from flask import render_template
from app.forms import invoiceForm
from pprint import pprint
from flask import Flask,redirect
from flask import request
import time
import io

from pprint import pprint

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
  #path = path.upper
  request_d = request.__dict__
  return Response(render_template('index.html', data=request_d))



