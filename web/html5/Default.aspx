<%@ Page Language="C#" AutoEventWireup="true" CodeFile="Default.aspx.cs" Inherits="_Default" %>

<%@ Import Namespace="System.Net" %>
<%@ Import Namespace="System.IO" %>
<%@ Import Namespace="System.Web.Script.Serialization" %>
<%@ Import Namespace="System.Threading.Tasks" %>
<%        
    //--------------------------------------------------------------------
    //
    //  For this sample, the location to look for source documents 
    //  specified only by name and the PCC Imaging Services (PCCIS) URL 
    //  are configured in pcc.config.
    //
    //--------------------------------------------------------------------

    PccConfig.LoadConfig("pcc.config");

    JavaScriptSerializer serializer = new JavaScriptSerializer();
    string[] transferProtocols = { "http://", "https://", "ftp://" };
    string document = string.Empty;
    string viewingSessionId = string.Empty;

    string documentQueryParameter = Request.QueryString["document"];
    string originalDocumentName = documentQueryParameter;
    
    if (!string.IsNullOrEmpty(documentQueryParameter))
    {
        // Construct the full path to the source document
        if (transferProtocols.Any(documentQueryParameter.Contains))
        {
            document = documentQueryParameter;
            originalDocumentName = documentQueryParameter;
        }
        else
        {
            document = Path.Combine(PccConfig.DocumentFolder, documentQueryParameter);
        }

        // Get the document's extension because PCCIS will need it later.
        string extension = System.IO.Path.GetExtension(document).TrimStart(new char[] { '.' }).ToLower();

        if (Path.IsPathRooted(document))
        {
            bool correctPath = PccConfig.IsFileSafeToOpen(document);
            if (!correctPath)
            {
                Response.Clear();
                Response.Write("<h1>403 Forbidden</h1>");
                Response.StatusCode = (int)System.Net.HttpStatusCode.Forbidden;
                return;
            }
        }

        // Request a new viewing session from PCCIS.
        //   POST http://localhost:18681/PCCIS/V1/ViewingSession
        // 
        string uriString = string.Format("{0}/ViewingSession", PccConfig.ImagingService);
        HttpWebRequest request = (HttpWebRequest)WebRequest.Create(uriString);
        request.Method = "POST";
        request.Headers.Add("acs-api-key", PccConfig.ApiKey);
        request.Headers.Add("accusoft-affinity-hint", document);
        using (StreamWriter requestStream = new StreamWriter(request.GetRequestStream(), Encoding.UTF8))
        {
            ViewingSessionProperties viewingSessionProperties = new ViewingSessionProperties();

            // Store some information in PCCIS to be retrieved later.
            viewingSessionProperties.tenantId = "My User ID";

            // The following are examples of arbitrary information as key-value 
            // pairs that PCCIS will associate with this document request.
            Dictionary<string, string> originInfo = new Dictionary<string, string>();
            originInfo.Add("ipAddress", Request.UserHostAddress);
            originInfo.Add("hostName", Request.UserHostName);
            originInfo.Add("sourceDocument", document);
            originInfo.Add("documentMarkupId", CommonCode.Encoder.GetHashString(document));
            viewingSessionProperties.origin = originInfo;

            // Specify rendering properties.
            viewingSessionProperties.render = new RenderProperties() { html5 = new Html5RenderProperties { alwaysUseRaster = false } };

            // Serialize document properties as JSON which will go into the body of the request
            string requestBody = serializer.Serialize(viewingSessionProperties);
            requestStream.Write(requestBody);
        }

        HttpWebResponse response = (HttpWebResponse)request.GetResponse();
        string responseBody = null;
        using (StreamReader sr = new StreamReader(response.GetResponseStream(), System.Text.Encoding.UTF8))
        {
            responseBody = sr.ReadToEnd();
        }

        // Store the ID for this viewing session that is returned by PCCIS
        Dictionary<string, object> responseValues = (Dictionary<string, object>)serializer.DeserializeObject(responseBody);
        viewingSessionId = responseValues["viewingSessionId"].ToString();

        // Get the user agent from the Request object so we can send to PCCIS in the background thread.
        // PCCIS uses this information to determine support for SVG and logging purposes.
        string userAgent = Request.Headers["User-Agent"];

        // Use a background thread to send the document to PCCIS and begin a viewing session.
        // This allows the current web page to finish loading and the PCC viewer to appear sooner.
        Task notificationTask = new Task(() =>
        {
            Stream documentStream = null;
            try
            {
                // Open the source document
                if (transferProtocols.Any(document.Contains))
                {
                    // Download the source document to memory if it's a remote document. The document
                    // data will be uploaded to PCCIS soon after.
                    HttpWebRequest fileRequest = (HttpWebRequest)HttpWebRequest.Create(document);
                    HttpWebResponse fileResponse = (HttpWebResponse)fileRequest.GetResponse();

                    using (Stream responseStream = fileResponse.GetResponseStream())
                    {
                        documentStream = new MemoryStream();
                        responseStream.CopyTo(documentStream);
                        documentStream.Seek(0, SeekOrigin.Begin);
                    }
                }
                else
                {
                    documentStream = new FileStream(document, FileMode.Open, FileAccess.Read);
                }

                // Upload File to PCCIS.
                //   PUT http://localhost:18681/PCCIS/V1/ViewingSessions/u{ViewingSessionID}/SourceFile?FileExtension={FileExtension}
                // Note the "u" prefixed to the Viewing Session ID. This is required when providing
                //   an unencoded Viewing Session ID, which is what PCCIS returns from the initial POST.
                //     
                uriString = string.Format("{0}/ViewingSession/u{1}/SourceFile?FileExtension={2}", PccConfig.ImagingService, viewingSessionId, HttpUtility.UrlEncode(extension));
                request = (HttpWebRequest)WebRequest.Create(uriString);
                request.Method = "PUT";
                request.Headers.Add("acs-api-key", PccConfig.ApiKey);
                using (Stream requestStream = request.GetRequestStream())
                {
                    documentStream.CopyTo(requestStream);
                }
                response = (HttpWebResponse)request.GetResponse();

                // Start Viewing Session in PCCIS.
                //   POST http://localhost:18681/PCCIS/V1/ViewingSessions/u{ViewingSessionID}/Notification/SessionStarted
                //    
                uriString = string.Format("{0}/ViewingSession/u{1}/Notification/SessionStarted", PccConfig.ImagingService, viewingSessionId);
                request = (HttpWebRequest)WebRequest.Create(uriString);
                request.Method = "POST";
                request.Headers.Add("acs-api-key", PccConfig.ApiKey);
                request.UserAgent = userAgent;
                using (Stream requestStream = request.GetRequestStream())
                {
                    using (TextWriter requestStreamWriter = new StreamWriter(requestStream))
                    {
                        serializer = new JavaScriptSerializer();
                        string requestBody = serializer.Serialize(new { viewer = "HTML5" });
                        requestStreamWriter.Write(requestBody);
                    }
                }
                response = (HttpWebResponse)request.GetResponse();
            }
            catch (Exception ex)
            {
                // If a problem was encountered in the background thread, notify PCCIS 
                // that the session should be stopped so it can return appropriate status
                // to the viewer requests made to it.
                //   POST http://localhost:18681/PCCIS/V1/ViewingSessions/u{ViewingSessionID}/Notification/SessionStopped
                //
                uriString = string.Format("{0}/ViewingSession/u{1}/Notification/SessionStopped", PccConfig.ImagingService, viewingSessionId);
                request = (HttpWebRequest)WebRequest.Create(uriString);
                request.Method = "POST";
                request.Headers.Add("acs-api-key", PccConfig.ApiKey);
                using (Stream requestStream = request.GetRequestStream())
                {
                    using (TextWriter requestStreamWriter = new StreamWriter(requestStream))
                    {
                        string requestBody = serializer.Serialize(new { endUserMessage = ex.Message, httpStatus = 504 });
                        requestStreamWriter.Write(requestBody);
                    }
                }
                response = (HttpWebResponse)request.GetResponse();
            }
            finally
            {
                if (documentStream != null)
                {
                    documentStream.Dispose();
                }
            }
        });
        notificationTask.Start();
    }
    else
    {
        viewingSessionId = Request.QueryString["viewingSessionId"];
        if (!string.IsNullOrEmpty(viewingSessionId))
        {
            // If there was no 'document' parameter, but a 'viewingSessionId'
            // value exists, there is a viewing session already so we don't 
            // need to do anything else. This case is true when viewing attachments
            // of email message document types (.EML and .MSG).

            // Request properties about the viewing session from PCCIS. 
            // The properties will include an identifier of the source document 
            // from which the attachment was obtained. The name of the attachment
            // is also available. These values are used to just to provide
            // contextual information to the user.
            //   GET http://localhost:18681/PCCIS/V1/ViewingSession/u{ViewingSessionID}
            //
            string uriString = string.Format("{0}/ViewingSession/u{1}", PccConfig.ImagingService, viewingSessionId);
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(uriString);
            request.Method = "GET";
            request.Headers.Add("acs-api-key", PccConfig.ApiKey);
            HttpWebResponse response = (HttpWebResponse)request.GetResponse();
            string responseBody = null;
            using (StreamReader sr = new StreamReader(response.GetResponseStream(), System.Text.Encoding.UTF8))
            {
                responseBody = sr.ReadToEnd();
            }
            ViewingSessionProperties viewingSessionProperties = serializer.Deserialize<ViewingSessionProperties>(responseBody);
            document = viewingSessionProperties.origin["sourceDocument"] + ":{" + viewingSessionProperties.attachmentDisplayName + "}";
        }
        else
        {
            Response.Write("You must include the name of a document in the URL.<br/>");
            Response.Write("For example, click on this link: <a href=\"Default.aspx?document=sample.doc\">Default.aspx?document=sample.doc</a>");
            return;
        }
    }
%>
<!DOCTYPE html>
<html>
<head id="Head1" runat="server">
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <!-- <meta name="viewport" content="width=device-width, initial-scale=1.0"> -->
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <title>PCC HTML5 .NET C# Sample</title>
    <link rel="icon" href="favicon.ico" type="image/x-icon" />

    <link rel="stylesheet" href="css/normalize.min.css">
    <link rel="stylesheet" href="css/viewercontrol.css">
    <link rel="stylesheet" href="css/viewer.css">

    <script src="//ajax.googleapis.com/ajax/libs/jquery/1.10.2/jquery.min.js"></script>
    <script>window.jQuery || document.write('<script src="js/jquery-1.10.2.min.js"><\/script>');</script>
    <script src="js/underscore.min.js"></script>

    <!--[if lt IE 9]>
        <link rel="stylesheet" href="css/legacy.css">
        <script src="js/selectivizr.js"></script>
        <script src="js/html5shiv.js"></script>
    <![endif]-->

    <script src="js/viewercontrol.js"></script>
    <script src="js/viewer.js"></script>
    
</head>
<body>
    <script type="text/javascript">
        var viewingSessionId = '<%=HttpUtility.JavaScriptStringEncode(viewingSessionId)%>';
        var languageJson = '<%=languageJson%>';
        var languageItems = jQuery.parseJSON(languageJson);
        var htmlTemplates = <%=htmlTemplates%>;
        var searchTerms = <%=searchJson%>;
        var redactionReasons = <%=redactionReasons%>;
        var originalDocumentName = '<%=originalDocumentName%>';

        var pluginOptions = {
            documentID: viewingSessionId,
            language: languageItems,
            predefinedSearch: searchTerms,
            template: htmlTemplates,
            redactionReasons: redactionReasons,
			signatureCategories: "Signature,Initials,Title",
			immediateActionMenuMode: "hover",
            documentDisplayName: originalDocumentName,
            uiElements: {
                download: true,
                fullScreenOnInit: true,
                advancedSearch:true
            }
        };
        $(document).ready(function () {
            var viewerControl = $("#viewer1").pccViewer(pluginOptions).viewerControl;
            
            // The following javascript will process any attachments for the
            // email message document types (.EML and .MSG).
            setTimeout(requestAttachments, 500);

            var countOfAttachmentsRequests = 0;

            function receiveAttachments (data, textStatus, jqXHR) {

                if (data == null || data.status != 'complete') {
                    // The request is not complete yet, try again after a short delay.
                    setTimeout(requestAttachments, countOfAttachmentsRequests * 1000);
                }

                if (data.attachments.length > 0) {
                    var links = '';
                    for (var i = 0; i < data.attachments.length; i++) {
                        var attachment = data.attachments[i];
                        links += '<a href="?viewingSessionId=' + attachment.viewingSessionId + '" target="blank">' + attachment.displayName + '</a><br/>';
                    }

                    $('#attachmentList').html(links);
                    $('#attachments').show();
                }
            }

            function requestAttachments () {
                if (countOfAttachmentsRequests < 10) {
                    countOfAttachmentsRequests++;
                    $.ajax('../pcc.ashx/ViewingSession/u' + viewingSessionId + '/Attachments', {dataType: 'json'}).done(receiveAttachments).fail(requestAttachments);
                }
            }            
            
        });
    </script>
    <div id="viewer1"></div>
    
    <div id="attachments" style="display:none;">
        <b>Attachments:</b>
        <p id="attachmentList">
        </p>
    </div>
    
</body>
</html>
