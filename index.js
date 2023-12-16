const fs = require('fs').promises;
const fs2 = require('fs');
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');
require('dotenv').config()

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
var stream = fs2.createWriteStream("logs.txt");
stream.on('error', console.error);
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

async function billStudents(auth) {
  const sheets = google.sheets({version: 'v4', auth});
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET,
    range: 'Billing!A2:N4',
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) {
    console.log('No data found.');
    return;
  }
  var arr = [];


  for (const row of rows) {
    await backoff(row, 0);
  };
}

async function backoff(row, exponent)
{
  if(exponent <= 10)
  {
    setTimeout(async () => {
      try{
        if(row[13] != null && parseInt(row[4].substring(1,row[4].length)) > 0)
        {
          await makeAndSendInvoice(row[1], row[13], row[4].substring(1,row[4].length), row[5].substring(1,row[5].length));
          stream.write(`Successfully Invoiced ${row[1]} at email ${row[13]} for amount ${row[4].substring(1,row[4].length)} with fees ${row[5].substring(1,row[5].length)}` + '\n');
        }
        else if(parseInt(row[4].substring(1,row[4].length)) == 0)
        {
          console.log(`${row[1]} was skipped because the amount was 0`);
          stream.write(`${row[1]} was skipped because the amount was 0` + "\n");
        }
        else
        {
          console.log(`${row[1]} was skipped because they didn't have an email`);
          stream.write(`${row[1]} was skipped because they didn't have an email` + "\n");
        }
      }
      catch(error){
        backoff(row, exponent + 1);
        console.log(`Retrying invoicing ${row[1]}`);
      }
    }, Math.pow(2, exponent) + Math.random() * 1000)
  }
  else
  {
    console.log(`There was a problem invoicing ${row[1]}. Aborting the invoice`);
    stream.write(`There was a problem invoicing ${row[1]}. Aborting the invoice`);
  }
}


const axios = require('axios');

const bearerToken = process.env.BEARER;

const date = new Date();
let day = date.getDate();
let month = date.getMonth() + 1;
let year = date.getFullYear();
const fullDate = `${day}-${month}-${year}`;

var invoiceTemplate = JSON.stringify(
    {
        "detail": {
          "invoice_date": "2023-08-09",
          "currency_code": "USD",
          "note": "Please take care of the invoice as soon as possible to avoid any late fee applied by our external accounting firm after a week. Thanks for your help on this. - SMC Solutions Inc.",
          "payment_term": {
            "term_type": "DUE_ON_DATE_SPECIFIED",
            "due_date": "2023-08-05"
          }
        },
        "invoicer": {
            "business_name":"SMC Solutions Inc.",
          "name": {
            "given_name": process.env.FIRSTNAME,
            "surname": process.env.LASTNAME
          },
          "email_address": process.env.EMAIL,
          "logo_url":process.env.LOGO,
          "phones": [
            {
              "country_code": "001",
              "national_number": process.env.PHONE,
              "phone_type": "MOBILE"
            }
          ],
        },
        "primary_recipients": [
          {
            "billing_info": {
              "name": {
                "given_name": "Stephanie"
              },
              "email_address": "sb-eig47726976584@personal.example.com"
            }
          }
        ],
        "items": [
          {
            "name": "Total Chess Fees",
            "quantity": "1",
            "unit_amount": {
              "currency_code": "USD",
              "value": "50.00"
            },
            "unit_of_measure": "AMOUNT"
          },
          {
            "name": "Paypal Fees",
            "quantity":"1",
            "unit_amount": {
              "currency_code": "USD",
              "value": "10.00"
            },
            "unit_of_measure": "AMOUNT"
          }
        ]
      }
);

const config = {
    headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation'},
  };

async function makeInvoice(name, address, total, fees){
    var invoice = JSON.parse(invoiceTemplate);
    invoice.primary_recipients[0].billing_info.name.given_name=name;
    invoice.primary_recipients[0].billing_info.email_address = address;
    invoice.items[0].unit_amount.value = total;
    invoice.items[1].unit_amount.value = fees;
    invoice = JSON.stringify(invoice);
    const response = await axios.post('https://api-m.paypal.com/v2/invoicing/invoices', invoice, config);
    // console.log(response.data);
    return response.data.id;
}

const config2 = {
    headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': 'b1d1f06c7246c'},
  };

async function sendInvoice(invoiceID){
    const response = await axios.post(`https://api-m.paypal.com/v2/invoicing/invoices/${invoiceID}/send`, 
        JSON.stringify({ "send_to_invoicer": true }),
        config2
    );
    // console.log(response.data);
}

async function makeAndSendInvoice(name, address, total, fees){
    try{
        var id = await makeInvoice(name, address, total, fees);
        try{
            await sendInvoice(id);

        }
        catch(error){
            // console.log(error);
            throw "Error in sending Invoice";
        }
    }
    catch(error){
        // console.log(error);
        throw "Error in Making Invoice";
    }
}
authorize().then(billStudents).then(() => {stream.end();}).catch(console.error);