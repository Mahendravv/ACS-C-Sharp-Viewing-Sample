using System;
using System.Linq;
using System.Web;
using System.IO;
using System.Security.Cryptography;
using System.Web.Services;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Collections;
using System.Text;
using System.Text.RegularExpressions;

public partial class _Default : System.Web.UI.Page
{
    public string languageJson = "{}";
    public string searchJson = "{}";
    public String htmlTemplates = String.Empty;
    public String redactionReasons = String.Empty;

    string fileName = "language.json";
    string searchtext = "predefinedsearch.json";
    string redactionReasonFile = "redactionReason.json";

    protected void Page_Load(object sender, EventArgs e)
    {
        if (!this.IsPostBack)
        {
            HttpRequest req = HttpContext.Current.Request;
            JavaScriptSerializer ser = new JavaScriptSerializer();
            string configPath = System.IO.Path.Combine(req.PhysicalApplicationPath, fileName);
            if (File.Exists(configPath))
            {
                using (Stream jsonDataStream = File.OpenRead(configPath))
                {
                    using (TextReader tr = new StreamReader(jsonDataStream))
                    {
                        languageJson = tr.ReadToEnd();
                        languageJson = languageJson.Replace('\r', ' ');
                        languageJson = languageJson.Replace('\n', ' ');
                        languageJson = languageJson.Replace('\t', ' ');
                    }
                    jsonDataStream.Close();
                }
            }

            configPath = System.IO.Path.Combine(req.PhysicalApplicationPath, searchtext);
            if (File.Exists(configPath))
            {
                using (Stream jsonDataStream = File.OpenRead(configPath))
                {
                    using (TextReader tr = new StreamReader(jsonDataStream))
                    {
                        searchJson = tr.ReadToEnd();
                        searchJson = searchJson.Replace('\r', ' ');
                        searchJson = searchJson.Replace('\n', ' ');
                        searchJson = searchJson.Replace('\t', ' ');
                    }
                    jsonDataStream.Close();
                }
            }

            getTemplates(req.PhysicalApplicationPath);
            getRedactonReasons(System.IO.Path.Combine(req.PhysicalApplicationPath, redactionReasonFile));
        }
    }

    private static string[] GetFiles(string sourceFolder, string filters, System.IO.SearchOption searchOption)
    {
        return filters.Split('|').SelectMany(filter => System.IO.Directory.GetFiles(sourceFolder, filter, searchOption)).ToArray();
    }

    private void getTemplates(string templatePath)
    {
        string templateData = string.Empty;
        Dictionary<string, String> json = new Dictionary<string, String>();

        //Location where template files are stored
        var templateList = GetFiles(templatePath + "\\html5", "*Template.html", System.IO.SearchOption.TopDirectoryOnly);

        for (int i = 0; i < templateList.Length; i++)
        {
            if (File.Exists(templateList[i]))
            {
                using (Stream jsonDataStream = File.OpenRead(templateList[i]))
                {
                    using (TextReader tr = new StreamReader(jsonDataStream))
                    {
                        templateData = tr.ReadToEnd();
                        templateData = templateData.Replace('\r', ' ');
                        templateData = templateData.Replace('\n', ' ');
                        templateData = templateData.Replace('\t', ' ');
                        if (templateData.Length > 0)
                        {
                            var regex = new Regex("Template.html", RegexOptions.IgnoreCase);
                            String fileName = regex.Replace(templateList[i], "");
                            json.Add(System.IO.Path.GetFileName(fileName), templateData);
                        }
                    }
                    jsonDataStream.Close();
                }
            }
        }
        //stringify JSON object
        htmlTemplates = toJSON(json);
    }

    private void getRedactonReasons(string filePath) 
    {
        if (File.Exists(filePath))
        {
            using (Stream jsonDataStream = File.OpenRead(filePath))
            {
                using (TextReader tr = new StreamReader(jsonDataStream))
                {
                    redactionReasons = tr.ReadToEnd();
                    redactionReasons = redactionReasons.Replace('\r', ' ');
                    redactionReasons = redactionReasons.Replace('\n', ' ');
                    redactionReasons = redactionReasons.Replace('\t', ' ');
                }
                jsonDataStream.Close();
            }
        }
    }

    private string toJSON(Object obj)
    {
        JavaScriptSerializer serializer = new JavaScriptSerializer();
        return serializer.Serialize(obj);
    }

}