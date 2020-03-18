from .. import app
import re

@app.template_filter()
def caps(text):
    """Convert a string to all caps."""
    return text.uppercase()

@app.template_filter()
def regex_replace(s, find, replace):
    """A non-optimal implementation of a regex filter"""
    return re.sub(find, replace, s)

