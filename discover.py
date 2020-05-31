
import socket
import struct
import sys
import redis
import upnpclient
import ipaddress
import re
from nested_lookup import nested_lookup
import time
import logging
import json
import getopt


local_ip = "200.200.200.200"
local_net = "200.200.200.0/24"

try:
    opts, args = getopt.getopt(sys.argv[1:],"hm:n:",["local-ip=","local-net="])
except getopt.GetoptError:
    print ('discover.py -m local_ip -n local_net')
    sys.exit(2)
for opt, arg in opts:
    if opt == '-h':
        print ('discover.py -m local_ip -n local_net')
        sys.exit()
    elif opt in ("-m", "--local-ip"):
        local_ip = arg
    elif opt in ("-n", "--local-net"):
        löcal_net = arg

local_net = ipaddress.ip_network('192.168.1.0/24')
me = '192.168.1.185'

msg = \
    'M-SEARCH * HTTP/1.1\r\n' \
    'HOST:239.255.255.250:1900\r\n' \
    'ST:upnp:rootdevice\r\n' \
    'MX:2\r\n' \
    'MAN:"ssdp:discover"\r\n' \
    '\r\n'

def discover_players():
    players = {}
    others = {}
    devices = upnpclient.discover()

    for d in devices:

        services_s = map(lambda service: str(service), d.services)
        ip = ipaddress.ip_network('200.200.200.200/32')
        ip_text = ''
        m = re.search('^http://([^\/\:]+)',  d._url_base)
        if m:
            ip = ipaddress.ip_network(m.group(1))
            ip_text = m.group(1)
        if ip.subnet_of(local_net) and "<Service service_id='urn:upnp-org:serviceId:AVTransport'>" in services_s:

            players[d.location] = {
                'location': d.location,
                'ip': ip_text,
                'name': d.friendly_name,
                'model_name': d.model_name,
                'last_seen': time.time()
                }

            try:
                r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
                r.set('upnp:player:' + d.location + ':data', json.dumps(players[d.location]))
                r.set('upnp:player:' + d.location + ':last_seen', players[d.location]['last_seen'])
            except Exception as e:
                logging.warning('setting data in redis nok ' + str(e))
                logging.debug(traceback.format_exc())
            finally:
                del r


        else:
            others[d.location] = {
                'location': d.location,
                'ip': ip_text,
                'name': d.friendly_name,
                'model_name': d.model_name,
                'last_seen': time.time()
                }


    return(players, others)

def get_key_by_ip(ip, D):
    for id, info in D.items():
        for key in info:
            if info[key] == ip:
                return id
    return ""

"""
d = upnpclient.Device("http://192.168.1.1:5000/rootDesc.xml")
"""
players, others = discover_players()
#print(players)
#print(others)

multicast_group = '239.255.255.250'
server_address = ('', 1900)

# Create the socket
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
# Tell the operating system to add the socket to the multicast group
# on all interfaces.
group = socket.inet_aton(multicast_group)
mreq = struct.pack('4sL', group, socket.INADDR_ANY)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)

# Bind to the server address
sock.bind(server_address)

# Tell the operating system to add the socket to the multicast group
# on all interfaces.
group = socket.inet_aton(multicast_group)
mreq = struct.pack('4sL', group, socket.INADDR_ANY)

# Receive/respond loop
last_discovered = 0;
while True:
    print('\nwaiting to receive message')
    data, address = sock.recvfrom(65507)
    print('address: ' + address[0])
    if(str(address[0]) in nested_lookup('ip', players)):
        print('received %s bytes from a player %s' % (len(data), address))
        base_url = get_key_by_ip(address[0],players)
        print('need to update last seen %s ' % ( players[base_url]['name'] ))

        players[base_url]['last_seen'] = time.time()
        try:
            r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
            r.set('upnp:player:' + base_url + ':last_seen', players[base_url]['last_seen'])
        except Exception as e:
            logging.warning('setting data in redis nok ' + str(e))
            logging.debug(traceback.format_exc())
        finally:
            del r



    elif(str(address[0]) in nested_lookup('ip',others)):
        print('received %s bytes from not player %s' % (len(data), address))
        base_url = get_key_by_ip(address[0],others)
        print('need to update last seen %s ' % (others[base_url]['name'] ))

        others[base_url]['last_seen'] = time.time()
    else:
        print('received %s bytes from unkown %s' % (len(data), address))
        ip = ipaddress.ip_network(address[0])
        if ip.subnet_of(local_net) and str(address[0]) != me and time.time()-last_discovered > 120:
            print('going to discover')
            players, others = discover_players()
            last_discovered = time.time()

    #bit rudimental
    if time.time()-last_discovered > 600:
        players, others = discover_players()
        last_discovered = time.time()



    #print('sending acknowledgement to', address)
    #sock.sendto('ack', address)
