# ACS C# Viewing Sample

This is a C# sample for using Accusoft's Cloud Services to view a document. With trivial changes, the same sample can be used to view documents using Accusoft's Prizm Content Connect on-premises product.

## Running the sample

Running the sample is quick and easy. Just follow the steps below.

### Configure the sample

The first step is to add your API key to the config file (web/pcc.config). To get a key, go to the [Accusoft Cloud Portal](https://cloudportal.accusoft.com), log in, then click the "My Keys" tab.

In web/pcc.config, replace "PlaceYourAPIKeyHere" with your API key.

### Check permissions

In addition to the web site itself, this sample includes four directories: `documents`, `imagestamps`, `annotations`, and `searchterms`.

The `documents` directory holds documents that you want to view and this directory should be readable by your web server.

The `imagestamps` directory holds images that you can stamp onto your document and this directory should be readable by your web server.

The `annotations` directory holds annotations that you create and this directory should be readable and writable by your web server.

The `searchterms` directory holds search terms and this directory should be readable by your web server.

### Configure the server

The next step is to configure IIS to run the sample. In the IIS Manager, expand the connections panel on the left to reach your Default Web Site. Right-click it and choose "Add Application".

Set the alias to "acsviewingsamplecsharp" and the physical path to the location of the sample's web folder.

### Test the sample

Open this URL in your browser to test the sample:

[http://localhost/acsviewingsamplecsharp/html5/Default.aspx?document=sample.doc](http://localhost/acsviewingsamplecsharp/html5/Default.aspx?document=sample.doc)

## Migrating to on-premises

To migrate this sample to an on-premises install of Prizm Content Connect, simply edit the config file. Prizm Content Connect does not need an API key, but you can leave that as-is because it will be ignored.

Change the value of WebServiceScheme from "https" to "http".
Change the value of WebServiceHost from "api.accusoft.com" to the name of your server.
Change the value of WebServicePort from "443" to the port of your server (depending on how it is configured, but usually 18681 or 18682).

