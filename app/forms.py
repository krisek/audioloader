from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, SubmitField
from wtforms.validators import DataRequired

class loginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    remember_me = BooleanField('Remember Me')
    submit = SubmitField('Sign In')


class invoiceForm(FlaskForm):
    #invoice = dict()
    tables = ['tblSparePartMaintenance', 'tblSparePartMain', 'tblWorkingMain', 'tblAdditionalCostsMaintenance', 'tblAdditionalCostsMain', 'tblLacquering', 'tblWorkingMaintenance', 'tblSummary', 'ownerTblLeft', 'contractChTable']
    #foreach table in tables:
    #    invoice[table] = StringField(, validators=[DataRequired()])


    tblSparePartMaintenance = StringField('tblSparePartMaintenance', validators=[DataRequired()])
    tblSparePartMain = StringField('tblSparePartMain', validators=[DataRequired()])
    tblWorkingMain = StringField('tblWorkingMain', validators=[DataRequired()])
    tblLacquering = StringField('tblLacquering', validators=[DataRequired()])
    tblAdditionalCostsMaintenance = StringField('tblAdditionalCostsMaintenance', validators=[DataRequired()])
    tblAdditionalCostsMain = StringField('tblAdditionalCostsMain', validators=[DataRequired()])
    tblWorkingMaintenance = StringField('tblWorkingMaintenance', validators=[DataRequired()])
    tblSummary = StringField('tblSummary', validators=[DataRequired()])
    ownerTblLeft = StringField('ownerTblLeft', validators=[DataRequired()])
    contractChTable = StringField('contractChTable', validators=[DataRequired()])
    oID = StringField('oID')

