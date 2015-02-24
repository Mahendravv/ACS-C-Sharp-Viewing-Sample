/*jshint devel: false, unused: false */
/*global jQuery, _: false*/
var PCCViewer = window.PCCViewer || {};

(function($, undefined) {
    'use strict';

    // Use this key to get or set the viewer object associated with DOM element in which the viewer is embedded.
    var DATAKEY = "PCCViewer.Viewer";

    // The main constructor for the Viewer. The preferred method is to use this through the jQuery plugin.
    // $("#mydiv").pccViewer(options);
    function Viewer(element, options) {
        // Check to see if there is one element per instance and present useful errors
        if (!element.length) {
            throw new Error('Unable to find the ' + element.selector + ' element.');
        }

        if (element.length > 1) {
            throw new Error('There are ' + element.length + ' ' + element.selector + ' elements. Please specify only one element per viewer instance.');
        }

        // If we are given a valid options argument, then we will create a new viewer.
        if (typeof options === 'object' && options !== null) {
            // Before we create a new viewer, destroy any existing viewer in the element.
            var existingViewer = element.data(DATAKEY);
            if (existingViewer && existingViewer.destroy) {
                existingViewer.destroy();
            }
        }
        // If options argument has an invalid value, throw.
        else {
            $.error('The options argument has an invalid value.');
        }

        // Load template with localization vars, then show the viewer once vars are in place, prevents fouc
        $(element)
            .html(_.template(options.template.viewer, options.language))
            .addClass('pccv')
            .show();

        var viewer = this;
        this.$dom = $(element);
        this.viewerID = viewer.$dom.attr("id");

        // Save a reference to these values to be used throughout the module
        this.pageCount = 0;
        this.pageNumber = 0;
        this.language = options.language;
        this.presetSearch = options.predefinedSearch || {};
        this.redactionReasons = options.redactionReasons || {};
        this.printRequest = {};
        this.currentMarks = [];
        this.uiMouseToolName = "";
        this.fontStyles = [];
        this.tabBreakPoint = 767; // in px, the max-width media query breakpoint for collapsing tabs into menu
        this.esignContext = {};
        this.activeFitType = PCCViewer.FitType.FullWidth;
        
        // full page redaction dialog
        this.isPageRedactionCanceled = false;
        this.fullPageRedactionReason = '';
        this.autoApplyRedactionReason = null;
        
        // This enum is a whitelist for sticky mouse tools. Tools on this list, with a value 
        // of `true`, will be able to be "locked" so that the tool does not automatically switch
        // away when used. This list is extended using one of the config options. Setting this object 
        // to an empty object turns off sticky tools completely.
        this.stickyTools = _.extend({
            Magnifier: false,
            SelectToZoom: false,
            PanAndEdit: false,
            SelectText: true,
            LineAnnotation: true,
            RectangleAnnotation: true,
            EllipseAnnotation: true,
            TextAnnotation: true,
            StampAnnotation: true,
            HighlightAnnotation: true,
            FreehandAnnotation: true,
            RectangleRedaction: true,
            TransparentRectangleRedaction: true,
            TextRedaction: true,
            StampRedaction: true,
            TextSelectionRedaction: true,
            PlaceSignature: true,
            ImageStampAnnotation: true,
            ImageStampRedaction: true,
            PolylineAnnotation : true,
            TextHyperlinkAnnotation: true
        }, options.stickyToolsFilter);
        this.stickyToolsAlwaysOn = false;
        
        // Check requested behavior for sticky tools. Values can be:
        // 'on' - tools are always sticky
        // 'off' - tools are never sticky
        // 'default' - tools are non-sticky on the first click, but can be toggled to sticky when clicking on an already active tool
        if (options.stickyTools === 'on') {
            this.stickyToolsAlwaysOn = true;
        } else if (options.stickyTools === 'off') {
            // disable all sticky tools
            this.stickyTools = {};
        }
        
        // Standardize template names
        options.template.printOverlay = options.template.printOverlay || options.template.printoverlay;
        options.template.pageRedactionOverlay = options.template.pageRedactionOverlay || options.template.element;
        options.template.contextMenu = options.template.contextMenu || options.template.contextmenu;

        // Validate some of the options used in ViewerControl
        options.resourcePath = options.resourcePath || "img";
        options.imageHandlerUrl = options.imageHandlerUrl || "../pcc.ashx";

        // Save the options to the viewer object
        this.viewerControlOptions = options;

        this.viewerControl = {};
        // DOM Nodes
        this.viewerNodes = {
            $download: viewer.$dom.find("[data-pcc-download]"),
            $pageList: viewer.$dom.find("[data-pcc-pageList]"),
            $nav: viewer.$dom.find("[data-pcc-nav]"),
            $navTabs: viewer.$dom.find("[data-pcc-nav-tab]"),
            $tabItems: viewer.$dom.find(".pcc-tab-item"),
            $toggles: viewer.$dom.find('[data-pcc-toggle]'),
            $dropdowns: viewer.$dom.find('[data-pcc-toggle-id*="dropdown"]'),
            $defaults: viewer.$dom.find('[data-pcc-default]'),
            $pageCount: viewer.$dom.find("[data-pcc-pagecount]"),
            $pageSelect: viewer.$dom.find("[data-pcc-pageSelect]"),
            $contextMenu: viewer.$dom.find('[data-pcc-context-menu]'),
            $firstPage: viewer.$dom.find("[data-pcc-first-page]"),
            $prevPage: viewer.$dom.find("[data-pcc-prev-page]"),
            $nextPage: viewer.$dom.find("[data-pcc-next-page]"),
            $lastPage: viewer.$dom.find("[data-pcc-last-page]"),
            $mouseTools: viewer.$dom.find("[data-pcc-mouse-tool]"),
            $selectText: viewer.$dom.find('[data-pcc-mouse-tool*="AccusoftSelectText"]'),
            $panTool: viewer.$dom.find('[data-pcc-mouse-tool*="AccusoftPanAndEdit"]'),
            $fitToWidth: viewer.$dom.find("[data-pcc-fit-to-width]"),
            $rotatePage: viewer.$dom.find("[data-pcc-rotate-page]"),
            $rotateDocument: viewer.$dom.find("[data-pcc-rotate-document]"),
            $zoomIn: viewer.$dom.find("[data-pcc-zoom-in]"),
            $zoomOut: viewer.$dom.find("[data-pcc-zoom-out]"),
            $fullScreen: viewer.$dom.find('[data-pcc-fullscreen]'),
            $annotationList: viewer.$dom.find("[data-pcc-load-annotations=list]"),
            $annotateSaveDialog: viewer.$dom.find("[data-pcc-toggle-id=dialog-save-annotations]"),
            $annotateLoadDialog: viewer.$dom.find("[data-pcc-toggle-id=dialog-load-annotations]"),
            $annotateLoadDropdown: viewer.$dom.find("[data-pcc-toggle-id=dropdown-load-annotations]"),
            $overlay: viewer.$dom.find('[data-pcc-overlay]'),
            $overlayFade: viewer.$dom.find('.pcc-overlay-fade'),
            $esignManage: viewer.$dom.find("[data-pcc-esign=manage]"),
            $esignFreehandLaunch: viewer.$dom.find("[data-pcc-esign=freehandLaunch]"),
            $esignTextLaunch: viewer.$dom.find("[data-pcc-esign=textLaunch]"),
            $esignImageLaunch: viewer.$dom.find("[data-pcc-esign=imageLaunch]"),
            $esignOverlay: viewer.$dom.find("[data-pcc-esign=overlay]"),
            $esignPlace: viewer.$dom.find("[data-pcc-esign=place]"),
            $esignPlaceDate: viewer.$dom.find("[data-pcc-esign=placeDate]"),
            $printLaunch: viewer.$dom.find("[data-pcc-print=launch]"),
            $printOverlay: viewer.$dom.find("[data-pcc-print=overlay]"),
            $pageRedactionLaunch: viewer.$dom.find("[data-pcc-page-redaction=launch]"),
            $pageRedactionOverlay: viewer.$dom.find("[data-pcc-page-redaction=overlay]"),
            
            $searchDialog: viewer.$dom.find("[data-pcc-toggle-id=dialog-search]"),
            $searchInput: viewer.$dom.find("[data-pcc-search=input]"),
            $searchSubmit: viewer.$dom.find("[data-pcc-search=submit]"),
            $searchCancel: viewer.$dom.find("[data-pcc-search=cancel]"),
            $searchCloser: viewer.$dom.find("[data-pcc-search=closer]"),
            $searchClear: viewer.$dom.find("[data-pcc-search=clear]"),
            
            $searchFilterContainer: viewer.$dom.find('[data-pcc-search-container=filter]'),
            $searchResultsContainer: viewer.$dom.find('[data-pcc-search-container=results]'),
            
            $searchPreviousContainer: viewer.$dom.find('[data-pcc-previous-search]'),
            $searchPresets: viewer.$dom.find('[data-pcc-toggle-id=dropdown-search-patterns] label'),
            $searchPresetsContainer: viewer.$dom.find('[data-pcc-predefined-search]'),
            $searchToggleAllPresets: viewer.$dom.find("[data-pcc-search=toggleAllPresets]"),
            
            $searchLoader: viewer.$dom.find("[data-pcc-search=loader]"),
            $searchStatus: viewer.$dom.find("[data-pcc-search=status]"),
            $searchResults: viewer.$dom.find("[data-pcc-search=results]"),
            $searchResultCount: viewer.$dom.find("[data-pcc-search=resultCount]"),
            
            $searchPrevResult: viewer.$dom.find("[data-pcc-search=prevResult]"),
            $searchNextResult: viewer.$dom.find("[data-pcc-search=nextResult]"),
            
            $searchExactPhrase: viewer.$dom.find("[data-pcc-search=exactWord]"),
            $searchMatchCase: viewer.$dom.find("[data-pcc-search=matchCase]"),
            $searchMatchWholeWord: viewer.$dom.find("[data-pcc-search=matchWholeWord]"),
            $searchBeginsWith: viewer.$dom.find("[data-pcc-search=beginsWith]"),
            $searchEndsWith: viewer.$dom.find("[data-pcc-search=endsWith]"),
            $searchWildcard: viewer.$dom.find("[data-pcc-search=wildcard]"),
            
			$imageStampOverlay: viewer.$dom.find("[data-pcc-image-stamp=overlay]"),
            $imageStampSelect: viewer.$dom.find("[data-pcc-image-stamp=select]"),
            $imageStampRedactSelect: viewer.$dom.find("[data-pcc-image-stamp-redact=select]"),
            
            $commentsPanel: viewer.$dom.find("[data-pcc-comments-panel]")
        };

        // Call the various methods required for initialization
        this.initializeViewer = function () {
            var maxPageWidth = 0;
            
            if (typeof this.redactionReasons.reasons !== 'undefined' && this.redactionReasons.reasons.length) {
                this.redactionReasons.reasons.unshift({"reason" : "-Clear Reason-"});
            }

            this.createPageList();
            this.bindMarkup();

            var me = this;
            var initOnPageCountReady = function () {
                viewer.viewerControl.off('PageCountReady', initOnPageCountReady);
                me.annotationIo.init();
                me.eSignature.init();
                me.imageStamp.init({
                    $imageStampSelect: viewer.viewerNodes.$imageStampSelect,
                    $imageStampRedactSelect: viewer.viewerNodes.$imageStampRedactSelect,
                    $imageStampOverlay: viewer.viewerNodes.$imageStampOverlay
                });

                if (viewer.redactionReasons.autoApplyDefaultReason === true) {

                    var defaultCount = 0;

                    _.each(viewer.redactionReasons.reasons, function (reasonObj) {

                        if (typeof reasonObj.defaultReason !== 'undefined' && reasonObj.defaultReason === true) {
                            defaultCount++;
                            PCCViewer.MouseTools.getMouseTool('AccusoftRectangleRedaction').getTemplateMark().setReason(reasonObj.reason);
                            PCCViewer.MouseTools.getMouseTool('AccusoftTextSelectionRedaction').getTemplateMark().setReason(reasonObj.reason);
                            viewer.autoApplyRedactionReason = reasonObj.reason;
                        }

                    });

                    if (defaultCount > 1) {
                        viewer.notify({message: viewer.language.redactionErrorDefault});
                    }
                }

                if (typeof viewer.redactionReasons.reasons !== 'undefined' && viewer.redactionReasons.reasons.length) {

                    if (viewer.redactionReasons.enableRedactionReasonSelection !== false) {
                        viewer.redactionReasons.enableRedactionReasonSelection = true;
                    }

                    if (viewer.redactionReasons.enableRedactionReasonSelection === false) {
                        viewer.redactionReasons.reasons = [];
                    }
                }

            };

            viewer.viewerControl.on('PageCountReady', initOnPageCountReady);
            
            viewer.viewerControl.on('PageDisplayed', function (ev) {
                viewer.viewerControl.requestPageAttributes(ev.pageNumber).then(
                        function (pageAttributes) {
                            if (pageAttributes.width > maxPageWidth) {
                                maxPageWidth = pageAttributes.width;
                                if (typeof viewer.activeFitType !== 'undefined') { viewer.viewerControl.fitContent(viewer.activeFitType); }
                            }
                        }
                );
            });


            setUIElements();
            setMouseToolDefaults();
            placeholderPolyfill();
            disableContextMenuTabbing();

            PCCViewer.MouseTools.createMouseTool("AccusoftPlaceDateSignature", PCCViewer.MouseTool.Type.PlaceSignature);

            // On window resize adjust dialogs and fit document
            setTimeout(function () {
                windowResize(function () {
                    toggleDialogOffset({fitContent: false});
                    if (typeof viewer.activeFitType !== 'undefined') { viewer.viewerControl.fitContent(viewer.activeFitType); }
                });
            }, 0);
        };

        // Bind the public API to the nodes
        this.bindMarkup = function () {

            var documentScrollPosition;

            // Page Navigation buttons
            viewer.viewerNodes.$firstPage.on('click', function () {
                viewer.viewerControl.changeToFirstPage();
            });
            viewer.viewerNodes.$prevPage.on('click', function () {
                viewer.viewerControl.changeToPrevPage();
            });
            viewer.viewerNodes.$nextPage.on('click', function () {
                viewer.viewerControl.changeToNextPage();
            });
            viewer.viewerNodes.$lastPage.on('click', function () {
                viewer.viewerControl.changeToLastPage();
            });

            // Fit Document to Width button
            viewer.viewerNodes.$fitToWidth.on('click', function () {
            
                if (viewer.activeFitType !== PCCViewer.FitType.FullWidth) {
                    viewer.activeFitType = PCCViewer.FitType.FullWidth;
                    viewer.viewerNodes.$fitToWidth.addClass('pcc-active');
                    if (viewer.uiMouseToolName === 'AccusoftSelectToZoom') {
                        viewer.setMouseTool({ mouseToolName: 'AccusoftPanAndEdit' });
                    }
                    viewer.viewerControl.fitContent(viewer.activeFitType);
                } else {
                    viewer.activeFitType = undefined;
                    viewer.viewerNodes.$fitToWidth.removeClass('pcc-active');
                }
                
            });

            // Rotate Page button
            viewer.viewerNodes.$rotatePage.on('click', function () {
                viewer.viewerControl.rotatePage(90);
                if (typeof viewer.activeFitType !== 'undefined') { viewer.viewerControl.fitContent(viewer.activeFitType); }
            });

            // Rotate Document button
            viewer.viewerNodes.$rotateDocument.on('click', function () {
                viewer.viewerControl.rotateDocument(90);
                if (typeof viewer.activeFitType !== 'undefined') { viewer.viewerControl.fitContent(viewer.activeFitType); }
            });

            // Zoom buttons
            viewer.viewerNodes.$zoomIn.on('click', function () {
                if (!this.className.match('pcc-disabled')) {
                    viewer.viewerControl.zoomIn(1.25);
                }
            });
            viewer.viewerNodes.$zoomOut.on('click', function () {
                if (!this.className.match('pcc-disabled')) {
                    viewer.viewerControl.zoomOut(1.25);
                }
            });

            // Full-screen toggle button
            viewer.viewerNodes.$fullScreen.on('click', function (ev) {
                viewer.$dom.toggleClass('pcc-full-screen');
                viewer.viewerNodes.$fullScreen.toggleClass('pcc-active');
                if (typeof viewer.activeFitType !== 'undefined') { viewer.viewerControl.fitContent(viewer.activeFitType); }
            });

            // Comments Panel toggle button
            viewer.viewerNodes.$commentsPanel.on('click', function () {

                var $pageListWrapper = viewer.viewerNodes.$pageList.find('.pccPageListContainerWrapper');
                
                if (viewer.viewerControl.getIsCommentsPanelOpen() === true) {
                    viewer.viewerNodes.$commentsPanel.removeClass('pcc-active');
                    viewer.viewerControl.closeCommentsPanel();
                    if (typeof viewer.activeFitType !== 'undefined') { viewer.viewerControl.fitContent(viewer.activeFitType); }
                    
                    if (typeof documentScrollPosition !== 'undefined') {
                        viewer.viewerNodes.$pageList.find('.pccPageListContainerWrapper').scrollLeft(documentScrollPosition);
                    }
                }
                else {
                    documentScrollPosition = $pageListWrapper.scrollLeft();
                    viewer.viewerNodes.$commentsPanel.addClass('pcc-active');
                    viewer.viewerControl.openCommentsPanel();
                    if (typeof viewer.activeFitType !== 'undefined') { viewer.viewerControl.fitContent(viewer.activeFitType); }
                    $pageListWrapper.scrollLeft(viewer.viewerNodes.$pageList.find('.pccPageListContainerWrapper > div:first-child').width());
                }
            });

            // Download button
            viewer.viewerNodes.$download.on('click', function () {
                fileDownloadManager.showOverlay(viewer.viewerNodes.$overlay, viewer.viewerNodes.$overlayFade);
            });

            viewer.viewerNodes.$esignPlace.on('click', function (ev) {
                // get last known signature
                var accusoftPlaceSignature = PCCViewer.MouseTools.getMouseTool('AccusoftPlaceSignature');
                var prevSignature = accusoftPlaceSignature.getTemplateMark().getSignature() || undefined;

                // Assign the signature to the mouse tool
                // This function will use the first signature as the default if one is not provided
                // We will update this every time in case some attributes have changed
                viewer.eSignature.changeMouseToolSignature(prevSignature, false, false);
            });

            viewer.viewerNodes.$esignPlaceDate.on('click', function (ev) {
                // get last known signature
                var accusoftPlaceSignature = PCCViewer.MouseTools.getMouseTool('AccusoftPlaceDateSignature');

                var date = new Date();
                var dateFormat = options.signatureDateFormat || 'MM/DD/YYYY';
                accusoftPlaceSignature.getTemplateMark().setSignature({ text: formatDate(date, dateFormat.toString()), fontName: "Arial" });
                
                viewer.setMouseTool({
                    mouseToolName: 'AccusoftPlaceDateSignature',
                    thisButton: this
                });
            });

            viewer.viewerNodes.$esignFreehandLaunch.on('click', viewer.launchESignFreehand);
            viewer.viewerNodes.$esignTextLaunch.on('click', viewer.launchESignText);
            viewer.viewerNodes.$esignManage.on('click', viewer.launchESignManage);


            // E-Signature modal
            viewer.viewerNodes.$esignOverlay
                // Close/Cancel button
                .on('click', '[data-pcc-esign="cancel"]', function () {
                    viewer.closeEsignModal();
                    $(window).off('resize', resizeESignContext);
                })

                // Toggle nodes
                .on('click', '[data-pcc-toggle]', function (ev) {
                    toggleNodes(ev, viewer.viewerNodes.$esignOverlay);
                })

                // Clear signature
                .on('click', '[data-pcc-esign="clear"]', function () {
                    if (viewer.esignContext && viewer.esignContext.clear) {
                        viewer.esignContext.clear();
                    }
                })

                // Download signature
                .on('click', '[data-pcc-esign="download"]', function () {
                    viewer.viewerControl.downloadSignature(PCCViewer.Signatures.toArray()[0]);
                })

                // Save for future use checkbox
                .on('click', '[data-pcc-radio]', function (ev) {
                    var $el = $(ev.target).data('pccRadio') ? $(ev.target) : $(ev.target).parent('[data-pcc-radio]');
                    $el.toggleClass('pcc-checked');
                })

                // Save
                .on('click', '[data-pcc-esign="save"]', function () {
                    var futureUse = viewer.viewerNodes.$esignOverlay.find('[data-pcc-radio]').hasClass('pcc-checked'),
                        categry = viewer.viewerNodes.$esignOverlay.find('[data-pcc-esign-category] .pcc-label').html();

                    if (viewer.esignContext && viewer.esignContext.done) {
                        var signature = viewer.esignContext.done();

                        if (signature.path === 'M0,0' || signature.text === "") {
                            // Do not save paths with no content or empty string text signatures.
                            // The user probably pressed "Save" by mistake
                            viewer.closeEsignModal();
                            return;
                        }

                        // Add custom properties
                        signature.category = categry;

                        // Add directive for local save code
                        signature.localSave = !!futureUse;

                        // Close modal
                        viewer.closeEsignModal();

                        // Enable the place signature tool.
                        viewer.viewerNodes.$esignPlace.prop('disabled', false).removeClass('pcc-disabled');

                        // Add to signatures collection if user requested it.
                        PCCViewer.Signatures.add(signature);

                        // Set the newly created signature as the default for the PlaceSignature mouse tool
                        viewer.eSignature.changeMouseToolSignature(signature, true);

                        // Update the context menu
                        updateContextMenu({
                            showContextMenu: true,
                            showAllEditControls: false,
                            mouseToolType: viewer.eSignature.mouseTool.getType()
                        });
                    }

                    $(window).off('resize', resizeESignContext);
                })

                // add convenience button to start new drawing from Manage view
                .on('click', '[data-pcc-esign="drawNew"]', viewer.launchESignFreehand)

                // add convenience button to start new text from Manage view
                .on('click', '[data-pcc-esign="typeNew"]', viewer.launchESignText)

                // Prevent default behavior of buttons inside the e-sign overlay to prevent form submission.
                .on('click', 'button', function (ev) {
                    ev.preventDefault();
                })

                // Configure dropdown in the esign overlay
                .on('click', '[data-pcc-toggle-id*="dropdown"]', function(ev){
                    handleDropdownBehavior(ev);
                });

            viewer.viewerNodes.$imageStampOverlay
                // Toggle nodes
                .on('click', '[data-pcc-toggle]', function (ev) {
                    toggleNodes(ev, viewer.viewerNodes.$imageStampOverlay);
                })
                // Configure dropdown in the esign overlay
                .on('click', '[data-pcc-toggle-id*="dropdown"]', function(ev){
                    handleDropdownBehavior(ev);
                });

            // Launch page redaction modal
            viewer.viewerNodes.$pageRedactionLaunch.on('click', function (ev) {
                // a switch we use to cancel page redaction
                viewer.isPageRedactionCanceled = false;

                if (options.template.pageRedactionOverlay) {
                    // template data that is used to configure how the page redaction overlay is shown
                    var tmplData = _.extend({
                        // indicates that the page redaction overlay will show the form to redact page(s)
                        show: 'form',
                        reasons: options.redactionReasons
                    }, options.language);

                    // Show the page redaction overlay and backdrop (fade)
                    viewer.viewerNodes.$pageRedactionOverlay.html(_.template(options.template.pageRedactionOverlay, tmplData)).addClass('pcc-open');
                    viewer.viewerNodes.$overlayFade.show();

                    // If there is an auto apply redaction reason, set the fullPageRedactionReason to that value.
                    if (viewer.autoApplyRedactionReason) {
                        viewer.fullPageRedactionReason = viewer.autoApplyRedactionReason;
                    }

                    // Update the redaction reason label with the last used full page redaction reason
                    if (viewer.fullPageRedactionReason && viewer.fullPageRedactionReason.length > 0) {
                        viewer.viewerNodes.$pageRedactionOverlay.find('[data-pcc-redaction-reason]').find('.pcc-label').text(viewer.fullPageRedactionReason);
                    }

                    placeholderPolyfill();
                    updatePageRedactionOverlayRangeInputs();
                } else {
                    // Throw an error for integrators in the case that the template is not defined.
                    // It's a common mistake to leave out templates.
                    throw new Error("The pageRedactionOverlay template is not defined in the viewer's options object.");
                }
            });

            // A helper for the page redaction overlay. This method checks the state of the form,
            // validates the include and exclude ranges, and may set classes on range inputs to
            // indicate an error.
            function updatePageRedactionOverlayRangeInputs() {
                var redactAllPagesChecked = viewer.viewerNodes.$pageRedactionOverlay.find('[data-pcc-page-redaction=redactAllPages]').hasClass('pcc-checked'),
                    redactRangeChecked = viewer.viewerNodes.$pageRedactionOverlay.find('[data-pcc-page-redaction=redactRange]').hasClass('pcc-checked'),
                    $excludeRangeFieldEl = viewer.viewerNodes.$pageRedactionOverlay.find('[data-pcc-page-redaction-field=excludeRange]'),
                    $includeRangeEl = viewer.viewerNodes.$pageRedactionOverlay.find('[data-pcc-page-redaction-range=include]'),
                    $excludeRangeEl = viewer.viewerNodes.$pageRedactionOverlay.find('[data-pcc-page-redaction-range=exclude]');


                // Hide the exclude rante input if redactAllPages element is unchecked
                if (redactAllPagesChecked) {
                    $excludeRangeFieldEl.show();
                } else {
                    $excludeRangeFieldEl.hide();
                }

                // re-validate page ranges. The error state may change when the checked state changes
                validateRangeAndUpdateErrorClass($includeRangeEl, {ignoreErrors: !redactRangeChecked});
                validateRangeAndUpdateErrorClass($excludeRangeEl, {
                    ignoreErrors: !redactAllPagesChecked,
                    emptyIsValid: true
                });
            }

            // A helper for the page redaction overlay. This method checks the state of a range input
            // and may set a class on the input to indicate an error with the specified range.
            function validateRangeAndUpdateErrorClass($target, options) {
                options = options || {};

                // ignoreErrors - if there are errors in the range input, don't show the class
                var ignoreErrors = options.ignoreErrors || false,

                    // emptyIsValid - an empty range input is valid
                    emptyIsValid = options.emptyIsValid || false,

                    // The range value from the input
                    range = getInputValueNotPlaceholder($target),

                // Indicates if the range is empty and the error class should not be applied.
                    ignoreBecauseEmpty = emptyIsValid && range.length === 0;

                var isValid = ignoreErrors || ignoreBecauseEmpty || PCCViewer.Util.validatePageRange(range, {
                        upperLimit: viewer.viewerControl.getPageCount()
                    }),
                    errorClass = 'pccError';

                // Add or remove the errorClass, which indicates that the range input is invalid but a
                // valid value is required.
                if (isValid) {
                    $target.removeClass(errorClass);
                } else {
                    $target.addClass(errorClass);
                }
            }

            // A helper for the page redaction overlay. This recursive method requests page attributes
            // and updates the progress bar in the page redaction overlay, after the user has clicked the
            // redact button.
            function requestPageAttributesAndUpdateProgressBar(pageNumbers, index, allPageAttributes) {
                var deferred;
                allPageAttributes = allPageAttributes || [];
                index = index || 0;

                if (!viewer.isPageRedactionCanceled && index < pageNumbers.length) {
                    var percent = Math.round(100 * (index / (pageNumbers.length + 1))) + '%';

                    // Show page count.
                    viewer.$dom.find('[data-pcc-page-redaction=resultCount]').html(viewer.language.pageRedactionOverlay.requestingAttributesOf + ' ' + pageNumbers[index]);

                    // Show percentage and update load bar.
                    viewer.$dom.find('[data-pcc-page-redaction=resultPercent]').html(percent);
                    viewer.$dom.find('[data-pcc-page-redaction=loader]').css('width', percent);

                    return viewer.viewerControl.requestPageAttributes(pageNumbers[index]).then(
                        function onFulfilled(pageAttributes) {
                            allPageAttributes.push(pageAttributes);

                            return requestPageAttributesAndUpdateProgressBar(pageNumbers, index + 1, allPageAttributes);
                        }
                    );
                } else {
                    deferred = PCCViewer.Deferred();
                    deferred.resolve(allPageAttributes);
                    return deferred.getPromise();
                }
            }

            // Redact page redaction modal
            viewer.viewerNodes.$pageRedactionOverlay
                // Cancel button
                .on('click', '[data-pcc-page-redaction="cancel"]', function () {
                    viewer.viewerNodes.$pageRedactionOverlay.removeClass('pcc-open');
                    viewer.viewerNodes.$overlayFade.hide();
                    viewer.isPageRedactionCanceled = true;
                })

                // Radio buttons
                .on('click', '[data-pcc-radio]', function (ev) {
                    var $el = $(ev.target).data('pccRadio') ? $(ev.target) : $(ev.target).parent('[data-pcc-radio]');

                    $el.addClass('pcc-checked');
                    viewer.viewerNodes.$pageRedactionOverlay.find('[data-pcc-radio="' + $el.data('pccRadio') + '"]').not(this).removeClass('pcc-checked');

                    updatePageRedactionOverlayRangeInputs();
                })

                // Validate include range if required
                .on('click', '[data-pcc-page-redaction=redactRange]', function (ev) {
                    var $el = $(ev.target).data('pccRadio') ? $(ev.target) : $(ev.target).parent('[data-pcc-radio]');

                    $el.addClass('pcc-checked');
                    viewer.$dom.find('[data-pcc-radio="' + $el.data('pccRadio') + '"]').not(this).removeClass('pcc-checked');

                    updatePageRedactionOverlayRangeInputs();
                })

                // Page range
                .on('focus', '[data-pcc-page-redaction-range=include]', function () {
                    var $el = viewer.viewerNodes.$pageRedactionOverlay.find('[data-pcc-page-redaction="redactRange"]');

                    viewer.viewerNodes.$pageRedactionOverlay.find('[data-pcc-radio="' + $el.data('pccRadio') + '"]').removeClass('pcc-checked');
                    $el.addClass('pcc-checked');

                    updatePageRedactionOverlayRangeInputs();
                })
                .on('keyup', '[data-pcc-page-redaction-range=exclude]', function (ev) {
                    var $target = $(ev.target);
                    validateRangeAndUpdateErrorClass($target, {emptyIsValid: true});
                })
                .on('keyup', '[data-pcc-page-redaction-range=include]', function (ev) {
                    var $target = $(ev.target);
                    validateRangeAndUpdateErrorClass($target);
                })

                // Toggle nodes
                .on('click', '[data-pcc-toggle]', function (ev) {
                    toggleNodes(ev, viewer.viewerNodes.$contextMenu);
                })

                // Select box dropdown menu click
                .on('click', '.pcc-dropdown div', function (ev) {
                    var $target = $(ev.target),
                        $parent = $target.parents('.pcc-select'),
                        option = $target.text();
                    viewer.fullPageRedactionReason = '';

                    // Handle nested element clicks
                    if ($target[0].localName === 'span') {
                        option = $target.parent().text();
                    }

                    //  Redaction reason
                    if ($parent.data().pccRedactionReason !== undefined) {
                        viewer.fullPageRedactionReason = option;
                        if (viewer.fullPageRedactionReason === '-Clear Reason-') {
                            viewer.fullPageRedactionReason = '';
                            $parent.find('.pcc-label').text(options.language.pageRedactionOverlay.selectReason);
                        } else {
                            $parent.find('.pcc-label').text(viewer.fullPageRedactionReason);
                        }
                    }
                })

                // Submit
                .on('click', '[data-pcc-page-redaction="submit"]', function () {
                    // Extract data from the page redaction overlay form. This data will be used to
                    // create full page rectangle redactions to the user's specification.
                    var checkedClass = 'pcc-checked',
                        isCurrent = viewer.$dom.find('[data-pcc-page-redaction=redactCurrentPage]').hasClass(checkedClass),
                        isRange = viewer.$dom.find('[data-pcc-page-redaction=redactRange]').hasClass(checkedClass),
                        isAll = viewer.$dom.find('[data-pcc-page-redaction=redactAllPages]').hasClass(checkedClass),
                        includeRangeVal = getInputValueNotPlaceholder(viewer.$dom.find('[data-pcc-page-redaction-range=include]')),
                        excludeRangeVal = getInputValueNotPlaceholder(viewer.$dom.find('[data-pcc-page-redaction-range=exclude]')),
                        pageCount = viewer.viewerControl.getPageCount(),
                        includeRangeIsValid = PCCViewer.Util.validatePageRange(includeRangeVal, {upperLimit: pageCount}),
                        excludeRangeIsValid = excludeRangeVal.length === 0 ||
                            PCCViewer.Util.validatePageRange(excludeRangeVal, {upperLimit: pageCount}),
                        pages,
                        tmplData = _.extend({
                            show: 'status'
                        }, options.language);

                    // Get an array that contains the page number of the pages that the user specified to redact.
                    // This is based on the selected options on the page redaction overlay form and the specified
                    // include or exclude ranges.
                    if (isAll) {
                        if (excludeRangeIsValid) {
                            pages = _.difference(_.range(1, pageCount + 1), PCCViewer.Util.convertPageRangeToArray(excludeRangeVal, {
                                allowEmpty: true
                            }));
                        } else {
                            viewer.notify({message: viewer.language.pageRedactionExcludeRangeError});
                        }
                    } else if (isRange) {
                        if (includeRangeIsValid) {
                            pages = PCCViewer.Util.convertPageRangeToArray(includeRangeVal);
                        } else {
                            viewer.notify({message: viewer.language.pageRedactionIncludeRangeError});
                        }
                    } else if (isCurrent) {
                        pages = [viewer.viewerControl.getPageNumber()];
                    }

                    if (pages) {
                        viewer.viewerNodes.$pageRedactionOverlay.html(_.template(options.template.pageRedactionOverlay, tmplData)).addClass('pcc-open');
                        viewer.viewerNodes.$overlayFade.show();

                        // Get page attributes, and update the progress bar as we go along
                        requestPageAttributesAndUpdateProgressBar(pages).then(
                            // Once we have page attributes for all of the specified pages,
                            // create full page RectangleRedactions on each page. Then close
                            // the Page Redaction overlay.
                            function onFulfilled(allPageAttributes) {
                                if (!viewer.isPageRedactionCanceled) {
                                    // Update status message.
                                    viewer.$dom.find('[data-pcc-page-redaction=resultCount]').html(viewer.language.pageRedactionOverlay.creatingRedactions);

                                    // Show percentage and update load bar. We have one more step than the number of
                                    // pages specified. The last step is to sychronously create all of the redaction marks.
                                    var percent = Math.round(100 * (pages.length / (pages.length + 1))) + '%';
                                    viewer.$dom.find('[data-pcc-page-redaction=resultPercent]').html(percent);
                                    viewer.$dom.find('[data-pcc-page-redaction=loader]').css('width', percent);

                                    // Now that we have page attributes for all pages, we create a rectangle redaction
                                    // for each page that covers the full page.
                                    _.each(allPageAttributes, function (pageAttributes, index) {
                                        var pageNumber = pages[index];

                                        // Use ViewerControl#addMark to add the rectangle redaction to the page.
                                        var redaction = viewer.viewerControl.addMark(pageNumber, PCCViewer.Mark.Type.RectangleRedaction)
                                            .setRectangle({
                                                x: 0,
                                                y: 0,
                                                width: pageAttributes.width,
                                                height: pageAttributes.height
                                            });

                                        // If a redaction reason was set by the user in the page redaction overlay form,
                                        // then we apply the redaction reason here.
                                        if (viewer.fullPageRedactionReason && viewer.fullPageRedactionReason.length > 0) {
                                            redaction.setReason(viewer.fullPageRedactionReason);
                                        }
                                    });
                                }

                                // Close the
                                viewer.viewerNodes.$pageRedactionOverlay.removeClass('pcc-open');
                                viewer.viewerNodes.$overlayFade.hide();
                            },
                            // If there was an issue getting page attributes for any of the pages,
                            // notify the user through the viewer's notification dialog and then
                            // hide the Page Redaction overlay
                            function onRejected(reason) {
                                // Notify the user of error and close the page redaction dialog.
                                viewer.notify({message: viewer.language.pageRedactionAttributeRequestError});
                                viewer.viewerNodes.$pageRedactionOverlay.removeClass('pcc-open');
                                viewer.viewerNodes.$overlayFade.hide();
                            });
                    }
                })

                // Prevent default behavior of buttons inside the page redaction overlay menu to prevent form submission.
                .on('click', 'button', function (ev) {
                    ev.preventDefault();
                });

            // Launch print modal
            viewer.viewerNodes.$printLaunch.on('click', function (ev) {
                var tmplData = _.extend({
                    canPrintMarks: viewer.viewerControl.canPrintMarks(),
                    show: 'form'
                }, options.language);

                viewer.viewerNodes.$printOverlay.html(_.template(options.template.printOverlay, tmplData)).addClass('pcc-open');
                viewer.viewerNodes.$overlayFade.show();
                placeholderPolyfill();

                // Determine whether document is landscape or portrait
                // Promises do not guarantee synchronous execution
                viewer.viewerControl.requestPageAttributes(1).then(function(attributes){
                    var orientation = attributes.width > attributes.height ? 'landscape' : 'portrait';
                    viewer.viewerNodes.$printOverlay.find('[data-pcc-print-orientation].pcc-checked').removeClass('pcc-checked');
                    viewer.viewerNodes.$printOverlay.find('[data-pcc-print-orientation="' + orientation + '"]').addClass('pcc-checked');
                });

                var annotationsEnabled = viewer.$dom.find('[data-pcc-print-annotations].pcc-checked').data('pccPrintAnnotations');

                if (!annotationsEnabled) {
                    viewer.$dom.find('[data-pcc-radio="printComments"]').addClass('pcc-disabled');
                    viewer.$dom.find('[data-pcc-radio="printReasons"]').addClass('pcc-disabled');
                } else {
                    viewer.$dom.find('[data-pcc-radio="printComments"]').removeClass('pcc-disabled');
                    viewer.$dom.find('[data-pcc-radio="printReasons"]').removeClass('pcc-disabled');
                }

            });

            // Print modal
            viewer.viewerNodes.$printOverlay
                // Cancel button
                .on('click', '[data-pcc-print="cancel"]', function () {
                    viewer.viewerNodes.$printOverlay.removeClass('pcc-open');
                    viewer.viewerNodes.$overlayFade.hide();
                    if (viewer.printRequest.cancel) {
                        viewer.printRequest.cancel();
                    }
                })

                // Radio buttons
                .on('click', '[data-pcc-radio]', function (ev) {
                    var $el = $(ev.target).data('pccRadio') ? $(ev.target) : $(ev.target).parent('[data-pcc-radio]');

                    $el.addClass('pcc-checked');
                    viewer.$dom.find('[data-pcc-radio="' + $el.data('pccRadio') + '"]').not(this).removeClass('pcc-checked');

                    var annotationsEnabled = viewer.$dom.find('[data-pcc-print-annotations].pcc-checked').data('pccPrintAnnotations');

                    if (!annotationsEnabled) {
                        viewer.$dom.find('[data-pcc-radio="printComments"]').addClass('pcc-disabled');
                        viewer.$dom.find('[data-pcc-radio="printReasons"]').addClass('pcc-disabled');
                    } else {
                        viewer.$dom.find('[data-pcc-radio="printComments"]').removeClass('pcc-disabled');
                        viewer.$dom.find('[data-pcc-radio="printReasons"]').removeClass('pcc-disabled');
                    }
                })

                // Page range
                .on('focus', '[data-pcc-print="range"]', function () {
                    var $el = viewer.$dom.find('[data-pcc-print-page="printRange"]');

                    viewer.$dom.find('[data-pcc-radio="' + $el.data('pccRadio') + '"]').removeClass('pcc-checked');
                    $el.addClass('pcc-checked');
                })
                .on('keyup', '[data-pcc-print="range"]', function (ev) {
                    var $target = $(ev.target),
                        isValid = viewer.viewerControl.validatePrintRange($target.val()),
                        errorClass = 'pccError';

                    if (isValid) {
                        $target.removeClass(errorClass);
                    } else {
                        $target.addClass(errorClass);
                    }
                })

                // Print submit
                .on('click', '[data-pcc-print="submit"]', function () {
                    var tmplData = {},
                        checkedClass ='pcc-checked',
                        errorClass = 'pccError',
                        isCurrent = viewer.$dom.find('[data-pcc-print-page="printCurrentPage"]').hasClass(checkedClass),
                        isRange = viewer.$dom.find('[data-pcc-print-page="printRange"]').hasClass(checkedClass),
                        rangeVal = viewer.$dom.find('[data-pcc-print="range"]').val(),
                        rangeIsValid = viewer.viewerControl.validatePrintRange(rangeVal),
                        orientation = viewer.$dom.find('[data-pcc-print-orientation].pcc-checked').data('pccPrintOrientation') === 'landscape' ? 'landscape' : 'portrait',
                        annotationsEnabled = viewer.$dom.find('[data-pcc-print-annotations].pcc-checked').data('pccPrintAnnotations'),
                        margins = viewer.$dom.find('[data-pcc-print-margins].pcc-checked').data('pccPrintMargins') ? 'default' : 'none',
                        commentsPrintLocation = viewer.$dom.find('[data-pcc-print-comments].pcc-checked').data('pccPrintComments'),
                        reasonsPrintLocation = viewer.$dom.find('[data-pcc-print-reasons].pcc-checked').data('pccPrintReasons'),
                        printOptions = {
                            range: isCurrent ? viewer.viewerControl.getPageNumber().toString() : (isRange ? rangeVal : 'all'),
                            orientation: orientation,
                            includeMarks: annotationsEnabled,
                            margins: margins,
                            includeComments: commentsPrintLocation,
                            includeReasons: reasonsPrintLocation
                        },
                        percent = 0,
                        dismissOverlay = function () {
                            viewer.viewerNodes.$printOverlay.removeClass('pcc-open');
                            viewer.viewerNodes.$overlayFade.hide();
                        };

                    if (!annotationsEnabled) {
                        commentsPrintLocation = 'none';
                        reasonsPrintLocation = 'none';
                        printOptions.includeComments = commentsPrintLocation;
                        printOptions.includeReasons = reasonsPrintLocation;
                    }

                    if (!isRange || isRange && rangeIsValid) {
                        viewer.printRequest = viewer.viewerControl.print(printOptions);
                        viewer.viewerNodes.$printOverlay.html(_.template(options.template.printOverlay, options.language)).addClass('pcc-open');
                        viewer.viewerNodes.$overlayFade.show();

                        viewer.printRequest
                            // As each page is prepared.
                            .on(PCCViewer.PrintRequest.EventType.PrintPagePrepared, function () {
                                percent = Math.round(100 * (viewer.printRequest.getPreparedCount() / viewer.printRequest.getPageCount())) + '%';

                                // Show page count.
                                viewer.$dom.find('[data-pcc-print="resultCount"]').html(viewer.language.printPreparingPage + ' ' + viewer.printRequest.getPreparedCount() + ' ' + viewer.language.printPreparingPageOf + ' ' + viewer.printRequest.getPageCount());

                                // Show percentage and update load bar.
                                viewer.$dom.find('[data-pcc-print="resultPercent"]').html(percent);
                                viewer.$dom.find('[data-pcc-print="loader"]').css('width', percent);
                            })

                            // When the print job has been prepared hide overlay.
                            .on(PCCViewer.PrintRequest.EventType.PrintCompleted, function () {
                                dismissOverlay();
                            })

                            // The print completed due to failure, hide overlay and show error.
                            .on(PCCViewer.PrintRequest.EventType.PrintFailed, function () {
                                dismissOverlay();
                                viewer.notify({message: viewer.language.printFailedError});
                            });

                    }
                    if (isRange && !rangeIsValid) {
                        viewer.notify({message: viewer.language.printRangeError});
                        viewer.$dom.find('[data-pcc-print="range"]').addClass(errorClass);
                    }
                })

                // Prevent default behavior of buttons inside the print menu to prevent form submission.
                .on('click', 'button', function (ev) {
                    ev.preventDefault();
                });

            // Context Menu
            viewer.viewerNodes.$contextMenu
                // Toggle nodes
                .on('click', '[data-pcc-toggle]', function (ev) {
                    toggleNodes(ev, viewer.viewerNodes.$contextMenu);
                })

                // Select box dropdown menu click
                .on('click', '.pcc-dropdown div', function (ev) {
                    var $target = $(ev.target),
                        $parent = $target.parents('.pcc-select'),
                        option = $target.text(),
                        mark = viewer.currentMarks[0],
                        fillColor = '',
                        opacity = 0,
                        borderWidth = 0,
                        borderColor = '',
                        fontColor = '',
                        fontName = '',
                        fontSize = '',
                        stampLabel = '',
                        redactionReason = '';

                    // Handle nested element clicks
                    if ($target[0].localName === 'span') {
                        option = $target.parent().text();
                    }

                    if ($parent.hasClass('pcc-select-color')) {
                        $parent.find('.swatch').css('background-color', $target.css('background-color'));
                    } else {
                        $parent.find('.pcc-label').text(option);
                    }

                    // Set selected mark properties
                    if (mark) {
                        // Fill color
                        if ($parent.data().pccFillColor !== undefined) {
                            fillColor = rgbToHex($target[0].style.backgroundColor);

                            if (mark.setColor) {
                                mark.setColor(fillColor);

                            } else if (mark.setFillColor) {
                                mark.setFillColor(fillColor);
                            }
                        }

                        // Fill opacity
                        if ($parent.data().pccFillOpacity !== undefined) {
                            opacity = Math.round(parseInt(option.replace(/\%/g, ''), 10) * 2.55);
                            mark.setOpacity(opacity);
                        }

                        // Border color
                        if ($parent.data().pccBorderColor !== undefined) {
                            borderColor = rgbToHex($target[0].style.backgroundColor);
                            mark.setBorderColor(borderColor);
                        }

                        // Border width
                        if ($parent.data().pccBorderWidth !== undefined) {
                            borderWidth = parseInt(option.replace(/^\s+|\s+$/g, ''), 10);

                            if (mark.setThickness) {
                                mark.setThickness(borderWidth);

                            } else if (mark.setBorderThickness) {
                                mark.setBorderThickness(borderWidth);
                            }
                        }

                        // Font color
                        if ($parent.data().pccFontColor !== undefined) {
                            fontColor = rgbToHex($target[0].style.backgroundColor);
                            mark.setFontColor(fontColor);
                        }

                        // Font name
                        if ($parent.data().pccFontName !== undefined) {
                            fontName = option;
                            mark.setFontName(fontName);
                        }

                        // Font size
                        if ($parent.data().pccFontSize !== undefined) {
                            fontSize = option;
                            mark.setFontSize(parseFloat(fontSize));
                        }

                        // Stamp label
                        if ($parent.data().pccStampLabel !== undefined) {
                            stampLabel = option;
                            mark.setLabel(stampLabel);
                        }

                        // Redaction reason
                        if ($parent.data().pccRedactionReason !== undefined) {
                            redactionReason = option;
                            if (redactionReason === '-Clear Reason-') {
                                redactionReason = '';
                            }
                            mark.setReason(redactionReason);
                        }
                    }
                })

                // Set font style array
                .on('click', '[data-pcc-font-style]', function (ev) {
                    var $target = $(ev.target),
                        str = $target.data('pccFontStyle'),
                        mark = viewer.currentMarks[0],
                        arr = viewer.fontStyles;

                    $target.toggleClass('pcc-active');

                    if (_.indexOf(arr, str) === -1) {
                        arr.push(str);
                    } else {
                        arr.splice(_.indexOf(arr, str), 1);
                    }

                    if (mark) {
                        mark.setFontStyle(arr);
                    }
                })

                // Set font text alignment
                // Each click cycles through an array of 0-2 returning 0, 1, or 2
                .on('click', '[data-pcc-font-align]', function (ev) {
                    var $target = $(ev.target),
                        counter = $target.data('counter'),
                        i = counter ? counter + 1: 1,
                        mark = viewer.currentMarks[0],
                        arr = [PCCViewer.Mark.HorizontalAlignment.Left, PCCViewer.Mark.HorizontalAlignment.Center, PCCViewer.Mark.HorizontalAlignment.Right];

                    // On 3 start back at 0
                    i = (i === 3) ? 0 : i;

                    // Change the icon and tooltip to Left Align, Center Align, or Right Align
                    $target.data('counter', i).attr({
                        'class': 'pcc-icon pcc-icon-text-' + arr[i].toLowerCase(),
                        title: viewer.language['paragraphAlign' + arr[i]]
                    });

                    if (mark) {
                        mark.setHorizontalAlignment(arr[i]);
                    }
                })

                // Delete marks button
                .on('click', '[data-pcc-delete-mark]', function (ev) {
                    viewer.viewerControl.deleteMarks(viewer.currentMarks);
                })

                .on('click', '[data-pcc-add-comment-context-menu]', function (ev) {
                    if (viewer.currentMarks.length) {
                        commentUIManager.addComment(viewer.currentMarks[0].getConversation());
                    }
                })

                // Move context menu up/down button
                .on('click', '[data-pcc-move-context-menu]', function (ev) {
                    viewer.viewerNodes.$contextMenu.toggleClass('pcc-move-bottom');
                })

                // Move mark layer order
                .on('click', '[data-pcc-move-mark]', function (ev) {
                    viewer.viewerControl['moveMark' + $(ev.target).data('pccMoveMark')](viewer.currentMarks[0]);
                })

                // Prevent default behavior of buttons inside the context menu to prevent form submission.
                .on('click', 'button', function (ev) {
                    ev.preventDefault();
                });

            function mouseToolSelectHandler(ev){
                var $target = $(ev.target),
                    mouseToolName = $target.data('pccMouseTool'),
                    mouseTool = PCCViewer.MouseTools.getMouseTool(mouseToolName);

                if (!mouseToolName || mouseTool.getType() === PCCViewer.MouseTool.Type.PlaceSignature) {
                    // mouse tool has no name or should be skipped
                    // skipped mouse tools have logic to use them elsewhere in this file
                    return;
                }

                // Some mouse tools buttons can be in a disabled state. For example, the select text mouse
                // tool button is disabled before we determine if there is text in the document.
                if ($target.hasClass('pcc-disabled')) {
                    return;
                }
                
                // We can handle this event, so prevent default -- this event should not be handled anywhere else
                ev.preventDefault();
                
                // deselect marks if selecting another mouse tool that's not edit
                if (mouseTool.getType() !== PCCViewer.MouseTool.Type.EditMarks) {
                    viewer.viewerControl.deselectAllMarks();
                }
                
                viewer.setMouseTool({
                    mouseToolName: mouseToolName,
                    thisButton: $target,
                    sourceType: ev.type
                });
            }
            
            // Mouse tool buttons
            this.viewerNodes.$mouseTools.on('click', function (ev) {
                mouseToolSelectHandler(ev);
            });

            // For a number input tag, entering a non-digit character invalidates the entire input, rather than
            // giving access to the invalid value for JavaScript validation. We want the number input to trigger
            // the number keyboard on Android and iOS. So instead, we will filter out invalid characters before
            // they are populated in the intup field.
            viewer.viewerNodes.$pageSelect.on("keydown", function (ev) {
                // jQuery cancels the event based on true/false return value
                // if using anything other than jQuery, this event needs to be cancelled, prevent default, and prevent bubbling manually

                switch (ev.keyCode) {
                    // Tab
                    case 9:
                        // Fall through
                    // Enter
                    case 13:
                        ev.target.blur();
                        return false;
                    // Backspace
                    case 8:
                        // Fall through
                    // Delete
                    case 46:
                        return true;
                    // Non-number keys on the Android number keyboard
                    case 0:
                        return false;
                }

                var arrows = function () {
                    // Keyboard arrow keys
                    return (ev.keyCode >= 37 && ev.keyCode <= 40);
                };
                var numPad = function () {
                    // Number pad keys are 96 - 105 (NumLock is on)
                    return (ev.keyCode >= 96 && ev.keyCode <= 105);
                };
                var numKeys = function () {
                    // Check if original event provides keyIdentifier
                    if (ev.originalEvent && ev.originalEvent.keyIdentifier) {
                        // Numbers are U+30 - U+39 (modern browsers have these)
                        var key = parseInt(ev.originalEvent.keyIdentifier.replace(/U\+/, ''), 10);
                        return (key >= 30 && key <= 39);
                    }
                    // Regular number keys are 48 - 57
                    return (ev.keyCode >= 48 && ev.keyCode <= 57) && !ev.shiftKey;
                };

                if (numPad() || numKeys() || arrows()) { return true; }
                else { return false; }
            });
            // When the input changes, we can trigger the page change. We already know this will be
            // a number, since all other characters have been filtered out.
            viewer.viewerNodes.$pageSelect.on("change", function (ev) {
                var val = $(ev.target).val();

                if (val.length > 0) {
                    // Validate that page number entered is not less than pagecount
                    if (val > viewer.viewerControl.getPageCount() || val < 1) {
                        // Add error class
                        ev.target.className += ' pccError';
                        setTimeout(function () {
                            // Remove error class
                            ev.target.className = ev.target.className.replace('pccError', '');
                            $(ev.target).val(viewer.viewerControl.getPageNumber());
                        }, 1200);
                        return;
                    }

                    viewer.viewerNodes.$pageSelect.val(val);
                    if (typeof viewer.viewerControl.setPageNumber === 'function') {
                        viewer.viewerControl.setPageNumber(+val);
                    }

                } else {
                    // Put current page number back
                    $(ev.target).val(viewer.viewerControl.getPageNumber());
                }
            });

            // Tab navigation
            viewer.viewerNodes.$tabItems.on('click', function (ev) {
                var $el = $(ev.currentTarget),
                    $elTrigger = viewer.$dom.find('.pcc-trigger'),
                    $elTabItem = viewer.$dom.find('.pcc-tab-item'),
                    $elDialogs = viewer.$dom.find('.pcc-dialog'),
                    $elContextMenu = viewer.$dom.find('.pcc-context-menu'),
                    $thisTabPane = $el.parents('.pcc-tab').find('.pcc-tab-pane'),
                    menuItemHeight = $elTrigger.height(),
                    menuIncr = menuItemHeight,
                    windowWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth,
                    leftOffsetClass = 'pcc-vertical-offset-left',
                    rightOffsetClass = 'pcc-vertical-offset-right';

                $elTabItem.removeClass('pcc-active');
                $elTrigger.html($el.html());

                // On small viewports, show drop menu
                if (windowWidth < viewer.tabBreakPoint) {
                    $elTabItem.toggleClass('pcc-open');

                    // Hide the menu item, adjust top css property of menu items
                    if ($el.hasClass('pcc-trigger')) {
                        viewer.$dom.find('.pcc-tab-item:not(.pcc-trigger)').removeClass('pcc-hide');
                        viewer.$dom.find('.pcc-tab-item:not(.pcc-trigger):contains("' + $el.text().replace(/^\s+|\s+$/g, '') + '")').addClass('pcc-hide');
                        _.each(viewer.$dom.find('.pcc-tabset .pcc-tab-item'), function (item) {
                            menuIncr = $(item).parent().prev().find('.pcc-tab-item').hasClass('pcc-hide') ? 0 : menuIncr;
                            $(item).css('top', ($(item).parent().index() * menuItemHeight) + menuIncr + 'px');
                        });
                    }
                }

                $el.addClass('pcc-active');
                $el.parents('.pcc-tab').siblings().find('.pcc-tab-pane').removeClass('pcc-open');

                $thisTabPane.addClass('pcc-open');

                // Dismiss all dialogs when switching tabs except for search results
                if (viewer.viewerNodes.$searchResults.is(':visible')) {
                    $elDialogs.not('[data-pcc-toggle-id=dialog-search]').removeClass('pcc-open');
                    viewer.$dom.find('[data-pcc-toggle*="dialog"]').not('[data-pcc-toggle=dialog-search]').removeClass('pcc-active');
                } else {
                    $elDialogs.removeClass('pcc-open');
                    viewer.$dom.find('[data-pcc-toggle*="dialog"]').removeClass('pcc-active');
                }

                // Add offset to dialogs, context menu, pagelist
                if ($thisTabPane.hasClass('pcc-tab-vertical pcc-right')) {
                    $elDialogs.removeClass(leftOffsetClass).addClass(rightOffsetClass);
                    $elContextMenu.removeClass(leftOffsetClass).addClass(rightOffsetClass);
                    viewer.viewerNodes.$pageList.removeClass(leftOffsetClass).addClass(rightOffsetClass);
                }
                else if ($thisTabPane.hasClass('pcc-tab-vertical')) { // Assumes .left (default)
                    $elDialogs.removeClass(rightOffsetClass).addClass(leftOffsetClass);
                    $elContextMenu.removeClass(rightOffsetClass).addClass(leftOffsetClass);
                    viewer.viewerNodes.$pageList.removeClass(rightOffsetClass).addClass(leftOffsetClass);
                }
                else if (!$el.hasClass('pcc-trigger')) {
                    $elDialogs.removeClass(leftOffsetClass).removeClass(rightOffsetClass);
                    $elContextMenu.removeClass(leftOffsetClass).removeClass(rightOffsetClass);
                    viewer.viewerNodes.$pageList.removeClass(leftOffsetClass).removeClass(rightOffsetClass);
                }

                // Add class to offset pagelist when vertical dialogs are present
                toggleDialogOffset({fitContent: false});
                if (typeof viewer.activeFitType !== 'undefined') { viewer.viewerControl.fitContent(viewer.activeFitType); }
            });

            // Toggle nodes
            viewer.viewerNodes.$toggles.on('click', function (ev) {
                toggleNodes(ev);
            });

            // Search buttons
            viewer.viewerNodes.$searchSubmit.on('click', function (ev) {
                // prevent this event from firing anything else
                ev.stopPropagation();
                
                var searchInput = viewer.viewerNodes.$searchInput.val();
                
                if (searchInput.length && searchInput === viewer.previousSearchInput) {
                    // the user clicked the search button a second time without changing the text string
                    viewer.search.executeSearch(true);
                } else {
                    // the user is making a new search using new text
                    viewer.previousSearchInput = searchInput;
                    viewer.search.executeSearch();
                }
            });

            viewer.viewerNodes.$searchCancel.on('click', function (ev) {
                viewer.search.cancelSearch();
            });

            viewer.viewerNodes.$searchInput.on('keydown', function (ev) {
                if (ev.keyCode === 13 || ev.keyCode === 9) {
                    ev.preventDefault();
                    viewer.search.executeSearch();
                }
            });
            viewer.viewerNodes.$searchPrevResult.on('click', function () {
                return viewer.search.previousResultClickHandler(this);

            });
            viewer.viewerNodes.$searchNextResult.on('click', function () {
                return viewer.search.nextResultClickHandler(this);

            });
            viewer.viewerNodes.$searchClear.on('click', function (ev) {
                viewer.search.clearSearch(ev);
                toggleDialogOffset({fitContent: false});
            });
            viewer.viewerNodes.$searchToggleAllPresets.on('click', function (ev) {
                ev.stopPropagation();
                
                var checked = false,
                    dataID = 'pcc-toggled';

                if ($(this).data(dataID)) {
                    checked = false;
                    $(this).data(dataID, false);
                } else {
                    checked = true;
                    $(this).data(dataID, true);
                }
                viewer.$dom.find('[data-pcc-predefined-search] input').prop('checked', checked);
            });

            viewer.viewerNodes.$searchExactPhrase.on('click', function (ev) {
                return viewer.search.exactPhraseClickHandler(this);
            });
            viewer.viewerNodes.$searchMatchCase.on('click', function (ev) {
                return viewer.search.matchCaseClickHandler(this);
            });
            viewer.viewerNodes.$searchMatchWholeWord.on('click', function(ev) {
                return viewer.search.matchWholeWordClickHandler(this);
            });
            viewer.viewerNodes.$searchBeginsWith.on('click', function(ev) {
                return viewer.search.beginsWithClickHandler(this);
            });
            viewer.viewerNodes.$searchEndsWith.on('click', function(ev) {
                return viewer.search.endsWithClickHandler(this);
            });
            viewer.viewerNodes.$searchWildcard.on('click', function(ev) {
                return viewer.search.wildcardClickHandler(this);
            });
            viewer.$dom.find('[data-pcc-nav-tab=search]').on('click', function () {
                viewer.viewerNodes.$searchInput.focus();
            });

            // Create a reusable function for dropdowns.
            // We can use this one for dropdowns in overlays
            function handleDropdownBehavior(ev) {
                var isSelect = $(ev.target).parents().hasClass('pcc-select'),
                    isLoadMarkup = $(ev.target).parents().hasClass('pcc-select-load-annotations'),
                    $selection = $(ev.target).is('span') ? $(ev.target).parent().clone() : $(ev.target).clone();

                if (isSelect && !isLoadMarkup) {
                    $(ev.target).parents('.pcc-select').find('.pcc-label').replaceWith($selection.addClass('pcc-label'));
                }
            }

            // Select box dropdown menus
            viewer.viewerNodes.$dropdowns.on('click', handleDropdownBehavior);

            // On document click close open dropdown menus
            $(document).click(function (ev) {
                var $target = $(ev.target),
                    isSelect = $target.parents().hasClass('pcc-select'),
                    isPrevSearch = $target.data('pccToggle') === 'dropdown-search-box' || $target.parent().data('pccToggle') === 'dropdown-search-box',
                    isSearchSubmit = $target.attr('data-pcc-search') === 'submit';

                // Dont close dropdowns that allow you to select multiple options
                if (!isSelect && !isPrevSearch && !isSearchSubmit) {
                    viewer.$dom.find('.pcc-dropdown').removeClass('pcc-open');
                }
                if (isSelect || isPrevSearch) {
                    viewer.$dom.find('.pcc-dropdown').not($target.parents('.pcc-select, .pcc-tab-pane').find('.pcc-dropdown')).removeClass('pcc-open');
                }
            });

            // Prevent default behavior of buttons inside the viewer to prevent form submission.
            viewer.$dom.find('button').on('click', function (ev) {
                ev.preventDefault();
            });
        };

        // Function to resize the eSign drawing context
        function resizeESignContext () {
            if (viewer.esignContext && viewer.esignContext.resize) {
                viewer.esignContext.resize();
            }
        }

        // Launch E-Signature modal
        this.launchESignModal = function launchESignModal (activeTab) {
            // Load the template, extending the language object with the signatures array
            viewer.viewerNodes.$esignOverlay.html(_.template(options.template.esignOverlay, _.extend({
                signatures: PCCViewer.Signatures.toArray(),
                activeTab: activeTab,
                categories: (options.signatureCategories) ? options.signatureCategories.split(',') : undefined
            }, options.language))).addClass('pcc-open');

            // Show the dark overlay
            viewer.viewerNodes.$overlayFade.show();
        };

        // Launch E-Signature modal in Freehand Mode
        this.launchESignFreehand = function launchESignFreehand () {
            viewer.launchESignModal("freehand");

            // Declare esigniture context
            viewer.esignContext = viewer.eSignature.getFreehandContext(viewer.viewerNodes.$esignOverlay.find('[data-pcc-esign="draw"]').get(0));

            // Make sure the context is resized if the window resizes (this happens often on mobile, actually)
            $(window).on('resize', resizeESignContext);
        };

        // Launch E-Signature modal in Text Mode
        this.launchESignText = function launchESignText () {
            viewer.launchESignModal("text");

            // Declare an custom esignature context
            viewer.esignContext = viewer.eSignature.getTextContext();
        };

        // Launch E-Signature modal in Manage Mode
        this.launchESignManage = function launchESignManage () {
            viewer.launchESignModal("manage");

            // check if there are any signatures
            if (PCCViewer.Signatures.toArray().length) {
                // clear the 'no signatures' message and populate previews
                var $manageView = viewer.viewerNodes.$esignOverlay.find('[data-pcc-esign=manageView]');
                $manageView.html('');
                viewer.eSignature.getManageContext($manageView.get(0));
            }
        };

        // Close the eSign modal and clean up
        this.closeEsignModal = function closeEsignModal () {
            viewer.viewerNodes.$esignOverlay.removeClass('pcc-open');
            viewer.viewerNodes.$overlayFade.hide();
        };

        // Set mouse tool, update current marks and show context menu
        this.setMouseTool = function (opts) {
            opts = opts || {};
            
            if (!opts.thisButton) {
                // try to find a matching button
                opts.thisButton = viewer.viewerNodes.$mouseTools.filter('[data-pcc-mouse-tool=' + opts.mouseToolName + ']');
            }
            
            var mouseToolName = opts.mouseToolName,
                $thisButton = $(opts.thisButton),
                forceLock = viewer.stickyToolsAlwaysOn,
                active = $thisButton.hasClass('pcc-active'),
                locked = $thisButton.hasClass('pcc-locked'),
                canLock = !!this.stickyTools[getMouseToolType(mouseToolName)];
            
            // Exit early if the mouse tool is not actually changing and it is not a lockable tool.
            if (!canLock && (!mouseToolName || this.uiMouseToolName === mouseToolName)) {
                return;
            }
            
            // make the buttons for this mouse tool active
            var buttons = viewer.$dom.find('[data-pcc-mouse-tool*=' + mouseToolName + ']');
            viewer.$dom.find('[data-pcc-mouse-tool]').not(buttons).removeClass('pcc-active pcc-locked');
            
            // activate the buttons
            if (forceLock && canLock) {
                // forceLocks come from API calls that do not know the current state of the buttons,
                // the expected hevavior is to activate and lock the tool
                buttons.addClass('pcc-active pcc-locked');
            } else if (active && canLock && !opts.apiTrigger) {
                // if the buttons is already active, then also lock it
                buttons.toggleClass('pcc-locked');
            } else {
                // activate the non-active buttons
                buttons.addClass('pcc-active');
            }

            // set the current mouse tool known to the UI
            this.uiMouseToolName = mouseToolName;
            
            if (this.uiMouseToolName === 'AccusoftSelectToZoom') {
                viewer.activeFitType = undefined;
                viewer.viewerNodes.$fitToWidth.removeClass('pcc-active');
            }

            // set the mouse tool of the ViewerControl
            this.viewerControl.setCurrentMouseTool(mouseToolName);

            // Get template mark for the mouse tool, and update the current marks array
            var mouseTool = PCCViewer.MouseTools.getMouseTool(mouseToolName);

            // populate current marks array
            if (mouseTool && mouseTool.getTemplateMark) {
                this.currentMarks = [mouseTool.getTemplateMark()];
            }
            else {
                this.currentMarks = [];
            }

            // determine if we need to show the context menu for this mouse tool
            var showContextMenu;
            if (buttons.length === 0 || buttons.data('pccContextMenu') === undefined) {
                // If a button for the mouse tool is not found and the data-pcc-context-menu attribute is not found,
                // then default to showing the context menu for the mouse tool. This mouse tool was likely set via
                // the API, outside of any UI elements.
                showContextMenu = true;
            } else {
                // otherwise, use the value of the data-pcc-context-menu attribute to determine whether to show the
                // context menu
                showContextMenu = !!buttons.data('pccContextMenu');
            }

            // update the context menu: this will either hide the context menu, show the context menu, or update
            // the context menu to show the correct controls
            updateContextMenu({
                showContextMenu: showContextMenu,
                showAllEditControls: mouseTool.getType() === PCCViewer.MouseTool.Type.EditMarks,
                mouseToolType: mouseTool.getType()
            });
        };
        
        this.setMouseToolIfUnlocked = function(mouseToolName, additionalAction) {
            var mouseTool = getCurrentMouseTool().getName(),
                $buttons = viewer.viewerNodes.$mouseTools.filter('[data-pcc-mouse-tool=' + mouseTool + ']'),
                locked = !!$buttons.filter('.pcc-active.pcc-locked').length;

            if (!locked) {
                viewer.setMouseTool({
                    mouseToolName: 'AccusoftPanAndEdit',
                    thisButton: $buttons.filter('.pcc-active.pcc-locked').get(0)
                });

                // trigger any additional action that was requested
                if (typeof additionalAction === 'function') {
                    additionalAction();
                }
            }
        };

        // Notification messages that display errors and messages to user
        this.notifyTimer = 0;
        this.notify = function (args) {
            var el = viewer.$dom.find('[data-pcc-notify]');

            if (typeof args.type !== 'undefined') {
                el.attr('data-pcc-notify-type', args.type);
            } else {
                el.attr('data-pcc-notify-type', 'error');
            }

            el.addClass('pcc-open').find('p').text(args.message);

            if (!args.sticky) {
                clearTimeout(viewer.notifyTimer);
                viewer.notifyTimer = setTimeout(function () {
                    el.removeClass('pcc-open');
                }, 3000);
            }
        };

        // Toggle elements on or off using the data-pcc-toggle attribute
        function toggleNodes (ev, tabParent) {
            var $elBeingToggled = {}, 
                $elContextMenu = viewer.viewerNodes.$contextMenu, 
                $target = $(ev.target),
                $currentTarget = $(ev.currentTarget),
                isPreset = false,
                toggleID = $currentTarget.attr('data-pcc-toggle'),
                toggleArgs = {};


            // For tabset hide other tab content
            if (tabParent && $target.parents().hasClass('pcc-tabs')) {
                $target.parents('.pcc-tabs').find('.pcc-active').removeClass('pcc-active');
                tabParent.find('.pcc-tab-content').removeClass('pcc-open');
            }

            if (toggleID === 'dialog-save-annotations') {
                if (!viewer.annotationIo.onOpenDialog('save')) {
                    return;
                }

            } else if (toggleID === 'dialog-load-annotations') {
                if (!viewer.annotationIo.onOpenDialog('load')) {
                    return;
                }
            }

            $elBeingToggled = viewer.$dom.find('[data-pcc-toggle-id="' + toggleID + '"]');
            isPreset = $target.parents().hasClass('pcc-select-search-patterns');

            $currentTarget.toggleClass('pcc-active');

            // If it is a dialog
            if ($elBeingToggled.hasClass('pcc-dialog')) {
                // Hide other dialogs, only one at a time
                $elBeingToggled.toggleClass('pcc-open').siblings('.pcc-dialog').removeClass('pcc-open');
                viewer.$dom.find('[data-pcc-toggle*="dialog"].pcc-active').not($currentTarget).removeClass('pcc-active');

                // Add class to offset pagelist when vertical dialogs are present that will persist in the UI
                if (toggleID === 'dialog-search') {
                    toggleArgs.fitContent = false;
                }

                toggleDialogOffset(toggleArgs);

                // Nudge the context menu if a dialog is shown
                if (viewer.$dom.find('.pcc-dialog.pcc-open').length && $(window).width() < viewer.tabBreakPoint) {
                    $elContextMenu.addClass('pcc-move');
                } else {
                    $elContextMenu.removeClass('pcc-move');
                }
            } else {
                // Search presets has unique dropdown behavior
                if (isPreset && $elBeingToggled.hasClass('pcc-open')) {
                    if ($target.hasClass('pcc-label') || $target.hasClass('pcc-arrow-down')) {
                        $elBeingToggled.removeClass('pcc-open');
                    }
                } else {
                    $elBeingToggled.toggleClass('pcc-open');
                }
                
            }
            
            if (typeof viewer.activeFitType !== 'undefined') { viewer.viewerControl.fitContent(viewer.activeFitType); }
        }

        // Update the context menu, either hide the context menu, show the context menu, or update to show the correct controls
        function updateContextMenu(args) {
            var className = 'pcc-open',
                $contextMenu = viewer.$dom.find('.pcc-context-menu'),
                tmplData = {},
                mark = viewer.currentMarks[0],
                lang = options.language,
                windowWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth,
                isSignatureTool = args.mouseToolType && args.mouseToolType === PCCViewer.MouseTool.Type.PlaceSignature;

            // Hide the menu if
            // the markSelectionChanged event is triggered AND there's no current marks OR
            // the edit tool is selected AND there's no current marks OR
            // any of the following tools are selected: rectangle redaction, transparent rectangle redaction, text selection redaction, select text, magnifier, select to zoom, date signature OR
            // multiple marks are selected
            var selectionChangeAndNoMarks = args.markSelectionChanged && !viewer.viewerControl.getSelectedMarks().length,
                editToolAndNoMarks = args.mouseToolType && (args.mouseToolType === PCCViewer.MouseTool.Type.EditMarks || args.mouseToolType === PCCViewer.MouseTool.Type.PanAndEdit) && !viewer.viewerControl.getSelectedMarks().length,
                isToolWithoutContext = args.mouseToolType && (args.mouseToolType === PCCViewer.MouseTool.Type.RectangleRedaction || args.mouseToolType === PCCViewer.MouseTool.Type.TransparentRectangleRedaction || args.mouseToolType === PCCViewer.MouseTool.Type.TextSelectionRedaction ||
                        args.mouseToolType === PCCViewer.MouseTool.Type.SelectText || args.mouseToolType === PCCViewer.MouseTool.Type.Magnifier || args.mouseToolType === PCCViewer.MouseTool.Type.SelectToZoom || viewer.viewerControl.getCurrentMouseTool() === "AccusoftPlaceDateSignature"),
                multipleMarksSelected = viewer.currentMarks.length > 1 ? true : false,
                isImageStampTool = args.mouseToolType && args.mouseToolType.search(/ImageStampAnnotation|ImageStampRedaction$/g) !== -1,
                isImageStampMenu = (mark && !!mark.getImage) || isImageStampTool;

            if (selectionChangeAndNoMarks || editToolAndNoMarks || isToolWithoutContext) {
                args.showContextMenu = false;
            }

            // hide the context menu if it should be hidden
            if (!args.showContextMenu) {
                $contextMenu.removeClass(className);
                return;
            }

            if (mark && (viewer.currentMarks.length || viewer.viewerControl.getSelectedMarks().length)) {

                var menuOptions = {
                    collapseLeftSide: false,
                    showTabArea: false,
                    showMainTab: false,
                    activateMainTab: false,
                    showBorderColorTab: false,
                    showFontTab: false,
                    activateFontTab: false,
                    showLayerTab: false,
                    activateLayerTab: false,
                    showESignTab: false,
                    activateESignTab: false,
                    showLinkTab: false,
                    activateLinkTab: false,
                    showImageTab: false,
                    activateImageTab: false
                };

                // collapse menu
                if (multipleMarksSelected) {
                    menuOptions.collapseLeftSide = true;
                } else if (mark.getType() === 'TextSelectionRedaction' && !viewer.redactionReasons.enableRedactionReasonSelection) {
                    menuOptions.collapseLeftSide = true;
                }

                // options for main tab
                if (isSignatureTool || mark.getType().search(/^ImageStampAnnotation|ImageStampRedaction$/) !== -1) {
                    menuOptions.showMainTab = false;
                } else if (mark.getType().search(/^TextSelectionRedaction$|^RectangleRedaction$/) !== -1) {
                    menuOptions.showMainTab = !!viewer.redactionReasons.enableRedactionReasonSelection;
                } else if (mark.getType().search(/^TextHyperlinkAnnotation$/) !== -1){
                    // do not open the menu for template marks
                    if (mark.getPageNumber() === 0) { 
                        $contextMenu.removeClass(className);
                        return;
                    } 
                    
                    menuOptions.showMainTab = false;
                    menuOptions.showLinkTab = true;
                    menuOptions.activateLinkTab = true;
                    menuOptions.linkText = mark.getHref();
                } else if (mark.getType().search(/^TransparentRectangleRedaction$|^TextRedaction$/) === -1) {
                    menuOptions.showMainTab = true;
                }

                if (menuOptions.showMainTab && !multipleMarksSelected) {
                    if (mark.getType().search(/^TransparentRectangleRedaction$|^TextRedaction$|^RectangleRedaction$|^TextSelectionRedaction$/) === -1) {
                        menuOptions.activateMainTab = true;
                    } else if (mark.getType().search(/^RectangleRedaction$|^TextSelectionRedaction$/) !== -1 && viewer.redactionReasons.enableRedactionReasonSelection) {
                        menuOptions.activateMainTab = true;
                    }
                }

                // options for border tab options
                if (mark.getBorderColor && mark.getBorderThickness) {
                    menuOptions.showBorderColorTab = true;
                }

                // options for font tab
                if (mark.getType() === 'TextAnnotation' || mark.getType() === 'TextRedaction') {
                    menuOptions.showFontTab = true;
                }

                if (menuOptions.showFontTab && !multipleMarksSelected) {
                    if (mark.getType().search(/^TextRedaction$/) !== -1) {
                        menuOptions.activateFontTab = true;
                    }
                }

                // options for layer tab
                if (args.showAllEditControls && mark.getType() !== 'HighlightAnnotation' &&
                    mark.getType() !== 'TextSelectionRedaction' &&
                    mark.getType() !== 'TextHyperlinkAnnotation') {
                    menuOptions.showLayerTab = true;
                }

                if (menuOptions.showLayerTab && !menuOptions.activateFontTab && !multipleMarksSelected) {
                    if (mark.getType().search(/^TransparentRectangleRedaction|ImageStampAnnotation|ImageStampRedaction$/) !== -1) {
                        menuOptions.activateLayerTab = true;
                    } else if (mark.getType().search(/^RectangleRedaction$/) !== -1 && !viewer.redactionReasons.enableRedactionReasonSelection) {
                        menuOptions.activateLayerTab = true;
                    }
                }

                // options for esign tab
                if (isSignatureTool) {
                    menuOptions.showESignTab = true;
                }

                if (menuOptions.showESignTab) {
                    if (isSignatureTool) {
                        menuOptions.activateESignTab = true;
                    }
                }
                
                // options for image tab
                if (isImageStampMenu) {
                    menuOptions.showImageTab = true;
                    menuOptions.activateImageTab = true;
                    menuOptions.activateLayerTab = false;
                    
                    menuOptions.currentImage = viewer.imageStamp.getImageUrl(mark.getImage());
                }
                
                // Check if any tabs are actually turned on at this point.
                // Note that multiple selected marks will always mean to hide the tab area
                if (!multipleMarksSelected) {
                    _.forEach(menuOptions, function(val, key){
                        //if (val === true && key.match(/show[^tT]+Tab/)){
                        if (val === true && key.match(/show[a-zA-Z]+Tab/)){
                            menuOptions.showTabArea = true;
                        }
                    });
                }

                // Define template vars and load context menu template
                tmplData = _.extend({
                    mark: mark,
                    multipleMarksSelected: multipleMarksSelected,
                    showAllEditControls: args.showAllEditControls,
                    showSignaturePreview: isSignatureTool,
                    paragraphAlignTitle: mark.getHorizontalAlignment ? lang['paragraphAlign' + mark.getHorizontalAlignment().charAt(0).toUpperCase() + mark.getHorizontalAlignment().slice(1)] : '',
                    reasons: viewer.redactionReasons,
                    menuOptions: menuOptions
                }, lang);

                $contextMenu.addClass(className).html(_.template(options.template.contextMenu, tmplData));

                disableContextMenuTabbing();

                if (isSignatureTool) {
                    var dom = $contextMenu.find('[data-pcc-esign-preview]').get(0),
                        mouseTool = viewer.eSignature.mouseTool,
                        signature = mouseTool.getTemplateMark().getSignature();

                    if (signature) {
                        viewer.eSignature.insertSignatureView(signature, dom, function () {
                            viewer.launchESignManage();
                        }, false);
                    }
                }
                
                if (menuOptions.linkText) {
                    var $input = $contextMenu.find('[data-pcc-link-input]');

                    $input.val(menuOptions.linkText);
                    
                    var submitLinkInput = function submitLinkInput(value){
                        hyperlinkMenu.setHref(mark, value);
                        
                        // update the menu in order to update the views
                        updateContextMenu(args);
                    };
                    
                    $input.on('change', function(ev){
                        submitLinkInput($(this).val());
                    }).on('keypress', function(ev){
                        if (ev.which === 13) { // Enter key to submit
                            submitLinkInput($(this).val());
                            $(this).blur();
                            return false;
                        }
                    });
                }

                if (menuOptions.currentImage) {
                    var $image = $contextMenu.find('[data-pcc-image-stamp-preview]');
                    
                    $image.click(function() {
                        if (isImageStampMenu && !isImageStampTool) {
                            // this is a change for an existing mark, so switch the image
                            viewer.imageStamp.selectMarkImage(function(newImage){
                                mark.setImage(newImage);
                                updateContextMenu(args);
                            });
                        } else {
                            // this is a change for the image associated with a mouse tool
                            viewer.imageStamp.selectToolImage(function(newImage){
                                // update the menu in order to update the views
                                updateContextMenu(args);
                            });
                        }
                    });
                }

                // On larger viewports expand the context menu options
                if (windowWidth > viewer.tabBreakPoint) {
                    $contextMenu.find('.pcc-pull-left').addClass(className);
                    $contextMenu.find('[data-pcc-toggle=context-menu-options]').toggleClass('pcc-active');
                }
            }
        }

        // Enable/disable features based on viewer configuration uiElements options
        function setUIElements () {
            var $firstTabItem = viewer.viewerNodes.$navTabs.eq(0).find('.pcc-tab-item');

            // Check for fullScreenOnInit
            if (options.uiElements && options.uiElements.fullScreenOnInit) {
                viewer.$dom.addClass('pcc-full-screen');
                viewer.viewerNodes.$fullScreen.addClass('pcc-active');
            }

            // There is a uiElements object in the viewer plugin options
            if (options.uiElements) {
                // Hide nodes
                if (options.uiElements.printing === false) {
                    viewer.viewerNodes.$printLaunch.remove();
                }
                if (options.uiElements.download === false) {
                    viewer.viewerNodes.$download.remove();
                }
                if (options.uiElements.copyPaste === false) {
                    viewer.viewerNodes.$selectText.remove();
                }

                // Hide tabs
                _.each(options.uiElements, function (value, key) {
                    if (key.search('Tab') !== -1 && !value) {
                        viewer.$dom.find('[data-pcc-nav-tab=' + key.replace('Tab', '') + ']').remove();
                    }
                });

                // Set nodes again after we've changed tabs
                viewer.viewerNodes.$navTabs = viewer.$dom.find('[data-pcc-nav-tab]');
                $firstTabItem = viewer.viewerNodes.$navTabs.eq(0).find('.pcc-tab-item');

                // If no tabs, adjust pagelist position
                if (!viewer.viewerNodes.$navTabs.length) {
                    viewer.viewerNodes.$pageList.css('top', viewer.viewerNodes.$nav.outerHeight());
                }
            }

            // Activate the first tab item and show it's tab pane.
            $firstTabItem.addClass('pcc-active').next('.pcc-tab-pane').addClass('pcc-open');

            // Make the tab menu trigger's content match the first tab.
            viewer.$dom.find('[data-pcc-nav-trigger]').html($firstTabItem.html());
            
            if (viewer.activeFitType === PCCViewer.FitType.FullWidth) { viewer.viewerNodes.$fitToWidth.addClass('pcc-active'); }

        }

        // Set mouse tool default colors set in template
        function setMouseToolDefaults () {
            _.each(viewer.viewerNodes.$mouseTools,function (el) {
                var color = $(el).data('pccDefaultFillColor'),
                    name = $(el).data('pccMouseTool'),
                    templateMark = {};

                if (color && PCCViewer.MouseTools.getMouseTool(name)) {
                    templateMark = PCCViewer.MouseTools.getMouseTool(name).getTemplateMark();

                    if (templateMark.setColor) {
                        templateMark.setColor(color);

                    } else if (templateMark.setFillColor) {
                        templateMark.setFillColor(color);
                    }
                }
            });
        }

        // Disable tabbing to context menu elements when it is hidden -- it is closed by default
        function disableContextMenuTabbing () {
            viewer.$dom.find('.pcc-context-menu').find('a, area, button, input, object, select').attr('tabindex', '-1');
        }

        // Polyfill for placeholder attribute
        function placeholderPolyfill () {
            if (!('placeholder' in document.createElement('input'))){
                _.each(viewer.$dom.find('[placeholder]'), function (el) {
                    var placeholderVal = $(el).attr('placeholder'),
                        placeholderClass = 'pcc-placeholder';

                    $(el)
                        .val(placeholderVal)
                        .addClass(placeholderClass)
                        .on('focus', function (ev) {
                            var $el = $(ev.target);
                            if ($el.val() === placeholderVal) {
                                $el.val('').removeClass(placeholderClass);
                            }
                        })
                        .on('blur', function (ev) {
                            var $el = $(ev.target);
                            if (!$el.val().length) {
                                $el.val(placeholderVal).addClass(placeholderClass);
                            }
                        });
                });
            }
        }

        // Helper method - gets the value of an input that is using a placeholder.
        // This method returns the correct value of the input.
        //
        // This works around an issue in older browsers, where  if no
        // text was entered then the value of the input is the placeholder value.
        function getInputValueNotPlaceholder($inputEl) {
            var placeholderClass = 'pcc-placeholder';
            if ($inputEl.hasClass(placeholderClass)) {
                return '';
            } else {
                return $inputEl.val();
            }
        }

        // Convert RGB string to HEX string
        function rgbToHex (rgb) {
            var rgbHexCode = '';
            // IE8 returns HEX, modern browsers return RGB.
            if (rgb.substring(0, 1) === '#') {
                rgbHexCode = rgb;
            } else {
                rgb = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
                rgbHexCode = '#' +
                    ('0' + Number(rgb[1], 10).toString(16)).slice(-2) +
                    ('0' + Number(rgb[2], 10).toString(16)).slice(-2) +
                    ('0' + Number(rgb[3], 10).toString(16)).slice(-2);
            }
            return rgbHexCode;
        }

        // On window resize, when the window has finished resizing execute callback
        function windowResize (callback) {
            var resizeDone = function (callback) {
                $(window).resize(function () {
                    clearTimeout(this.id);
                    this.id = setTimeout(callback, 300);
                });
            };
            resizeDone(function () {
                callback();
            });
        }

        // Gets the type of any mouse tool
        function getMouseToolType(name){
            return PCCViewer.MouseTools.getMouseTool(name).getType();
        }
        // Gets the MouseTool type of the current mouse tool
        function getCurrentMouseToolType(){
            var currentToolName = viewer.viewerControl.getCurrentMouseTool();
            return PCCViewer.MouseTools.getMouseTool(currentToolName).getType();
        }
        // Gets the current mouse tool
        function getCurrentMouseTool(){
            var currentToolName = viewer.viewerControl.getCurrentMouseTool();
            return PCCViewer.MouseTools.getMouseTool(currentToolName);
        }

        // Add class to offset pagelist when vertical dialogs are present
        function toggleDialogOffset (args) {
            var openDialog = viewer.$dom.find('.pcc-dialog.pcc-open'),
                windowWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;

            // Only apply offset if active button
            if (viewer.$dom.find('[data-pcc-toggle*="dialog"].pcc-active').length) {
                viewer.viewerNodes.$pageList.addClass('pcc-dialog-offset');
            } else {
                viewer.viewerNodes.$pageList.removeClass('pcc-dialog-offset');
            }

            // Shrink the document to fit the viewport width
            if (!args || !!args.fitContent) {
                viewer.viewerControl.fitContent(PCCViewer.FitType.ShrinkToWidth);
            }
        }

        // Page list event handlers

        // Estimated page count is available
        function estimatedCountHandler (ev) {
            viewer.pageCount = ev.pageCount;
            viewer.viewerNodes.$pageCount.html(ev.pageCount);
        }

        // Page count is available
        function pageCountHandler (ev) {
            viewer.pageCount = ev.pageCount;
            viewer.viewerNodes.$pageCount.html(ev.pageCount);

            // Show Next/Previous page navigation buttons if multiple pages
            if (ev.pageCount > 1) {
                viewer.viewerNodes.$firstPage.removeClass('pcc-hide');
                viewer.viewerNodes.$lastPage.removeClass('pcc-hide');
                viewer.viewerNodes.$prevPage.addClass('pcc-show-lg');
                viewer.viewerNodes.$nextPage.addClass('pcc-show-lg');
            }

            // Initialize predefined search
            viewer.search.initialSearchHandler();
        }

        // Page failed to load
        // Error Codes:
        // 504 - Document Not Found or Server Error
        // 403 - Session Expired
        function pageLoadFailedHandler (ev) {
            var message = viewer.language.documentNotFound;
            if (ev.statusCode === 504 || ev.statusCode === 403 || ev.statusCode === 580) {
                if (ev.statusCode === 403) {
                    message = viewer.language.sessionExpired;
                }
                viewer.notify({ sticky: true, message: message });
                viewer.viewerNodes.$pageList.hide();
            }
        }

        // Page has changed
        function pageChangedHandler (ev) {
            viewer.viewerNodes.$pageSelect.val(ev.pageNumber);
        }

        // Once a mark has been created
        function markCreatedHandler (ev) {
            // Leave text tool selected so you can enter text, otherwise select edit annotation tool.
            if (ev.mark.getType() !== "TextAnnotation" &&
                ev.mark.getType() !== "TextRedaction" &&
                getCurrentMouseToolType() !== PCCViewer.MouseTool.Type.EditMarks) {
                
                viewer.setMouseToolIfUnlocked('AccusoftPanAndEdit', function(){
                    // Hide context menu -- this will execute only if the tool change takes effect
                    viewer.viewerNodes.$contextMenu.removeClass('pcc-open');
                });
            }
        }

        // Mark has changed
        function markChangedHandler (ev) {
            var markType = ev.mark.getType();

            // Once text is entered into the text tool and click outside, select edit annotation tool.
            if ((markType === 'TextAnnotation' || markType === 'TextRedaction') && getCurrentMouseToolType() !== PCCViewer.MouseTool.Type.EditMarks) {
                viewer.setMouseToolIfUnlocked('AccusoftPanAndEdit');
            } else if (markType === 'FreehandSignature' || markType === 'TextSignature') {
                // Keep track of the size that the user has used for the signature
                viewer.eSignature.updateSignatureSizeOnDocument(ev.mark);
            }
        }

        // Mark selection has changed
        function markSelectionChangedHandler () {
            var marks = viewer.viewerControl.getSelectedMarks();

            // Update current marks array
            viewer.currentMarks = marks;
            // Show context menu
            updateContextMenu({
                showContextMenu: true,
                showAllEditControls: true,
                markSelectionChanged: true
            });

        }

        // Document has text promise is resolved
        function documentHasTextResolved (hasText) {
            if (hasText) {
                // Show text selection tool
                viewer.viewerNodes.$selectText.removeClass('pcc-disabled');
            }
        }

        // Page text is ready
        function pageTextReadyHandler (ev) {
            viewer.search.pageTextReadyHandler(ev);
        }

        // Scaling of page(s) in the viewer has changed
        function scaleChangedHandler (ev) {
            var disabledClass = 'pcc-disabled';
                
            if (ev.fitType !== PCCViewer.FitType.FullWidth) {
                viewer.activeFitType = undefined;
                viewer.viewerNodes.$fitToWidth.removeClass('pcc-active');
            }

            // If the viewer is at or beyond the maximum scale, and cannot be zoomed in any further, disable the Zoom In Tool
            if (viewer.viewerControl.getAtMaxScale()) {
                viewer.viewerNodes.$zoomIn.addClass(disabledClass);

            // Otherwise show the Zoom In Tool
            } else {
                if (viewer.viewerNodes.$zoomIn.hasClass(disabledClass)) {
                    viewer.viewerNodes.$zoomIn.removeClass(disabledClass);
                }
            }

            // If the viewer is at or beyond the minimum scale, and cannot be zoomed out any further, disable the Zoom Out Tool
            if (viewer.viewerControl.getAtMinScale()){
                viewer.viewerNodes.$zoomOut.addClass(disabledClass);

            // Otherwise show the Zoom Out Tool
            } else {
                if (viewer.viewerNodes.$zoomOut.hasClass(disabledClass)) {
                    viewer.viewerNodes.$zoomOut.removeClass(disabledClass);
                }
            }
        }

        // Viewer Ready event handler
        function viewerReadyHandler () {
            // pre-load signature fonts
            fontLoader.preLoad();
            commentUIManager.init(viewer.viewerControl, options.template.comment, options.language, options.commentDateFormat, viewer.viewerNodes.$commentsPanel);
        }

        // Create the page list
        this.createPageList = function () {

            // The pageList element requires that it has an ID
            viewer.viewerNodes.$pageList.attr("id", "pcc-pageList-" + viewer.viewerID);

            try {
                // Use the whole options object here.
                this.viewerControl = new PCCViewer.ViewerControl(viewer.viewerNodes.$pageList.get(0), viewer.viewerControlOptions);
            }
            catch (ex) {
                viewer.notify({ sticky: true, message: ex.message });
                viewer.viewerNodes.$pageList.hide();
                return;
            }

            // Attach the PageCountReady and estimated count ready events that would trigger further page adds
            this.viewerControl.on(PCCViewer.EventType.EstimatedPageCountReady, estimatedCountHandler);
            this.viewerControl.on(PCCViewer.EventType.PageCountReady, pageCountHandler);
            this.viewerControl.on(PCCViewer.EventType.PageLoadFailed, pageLoadFailedHandler);
            this.viewerControl.on(PCCViewer.EventType.PageChanged, pageChangedHandler);
            this.viewerControl.on(PCCViewer.EventType.MarkCreated, markCreatedHandler);
            this.viewerControl.on(PCCViewer.EventType.MarkChanged, markChangedHandler);
            this.viewerControl.on(PCCViewer.EventType.MarkSelectionChanged, markSelectionChangedHandler);
            this.viewerControl.on(PCCViewer.EventType.ScaleChanged, scaleChangedHandler);
            this.viewerControl.on(PCCViewer.EventType.ViewerReady, viewerReadyHandler);
            this.viewerControl.on(PCCViewer.EventType.PageTextReady, pageTextReadyHandler);
            this.viewerControl.documentHasText().then(documentHasTextResolved);

            // Initialize the download options menu
            if (!(options.uiElements && options.uiElements.download === false)) {
                fileDownloadManager.init(this.viewerControl, options.template.downloadOverlay, options.language);
			}

            // Initialize immediate action menu
            if (options.immediateActionMenuMode && options.immediateActionMenuMode.toLowerCase() !== "off") {
                immediateActionMenu.init(this.viewerControl, options.immediateActionMenuMode, viewer.redactionReasons, options.language);
            }
            
            // Initialize the hyperlink menu
            hyperlinkMenu.init(this.viewerControl, viewer.language, options.template.hyperlinkMenu, getCurrentMouseToolType);
        };

        // Destroy the viewer control
        this.destroy = function () {
            if (viewer.viewerControl) {
                viewer.viewerControl.destroy();
                delete viewer.viewerControl;
            }

            viewer.$dom.removeData(DATAKEY);
            viewer.$dom.html("");
        };

        // The search module implements the UI control and API access necessary
        // to implement the viewer's document text search functionality. Module members that
        // are prefixed with 'private' are only accessible with the module's scope while 'public'
        // means it can be accessed outside the module's scope.
        this.search = (function () {

            // The search request object returned from the API.
            var searchRequest = {},

            // The number of search hits currently known to the viewer.
                searchResultsCount = 0,

            // An array containing the current search results.
                searchResults = [],

            // The search result currently selected by the user.
                $activeSearchResult,

            // An array containing search items loaded from predefinedSearch.json.
                presetSearchTerms = [],

            // This is a container object that maps search terms (as keys) to search option objects (as values).
                previousSearches = {},

            // A simple search uses a basic text query versus a more advanced regular expression.
                privateSimpleSearch = true,
            
            // Find the advanced search toggle button and panel
            // We will toggle these to off mode when search is executed
                $advancedSearchToggle = viewer.$dom.find('[data-pcc-toggle=advanced-options]'),
                $advancedSearchPanel = viewer.$dom.find('[data-pcc-toggle-id="advanced-options"]'),
                $searchContainerToggles = viewer.$dom.find('[data-pcc-search-container-toggle]'),
                $searchFilterSections = viewer.$dom.find('[data-pcc-search-container=filter] [data-pcc-section]'),

            // Find advanced search type column elements
                $advancedSearchColumnHeader = viewer.$dom.find('.pcc-row-results-header').children(),
            // A search query object to store all processed search terms
                globalSearchTerms = {},
                
            // Save the previous search query to reuse if needed
                prevSearchQuery = {},
            // Save the previous matching options
                prevMatchingOptions = {},
                
            // Use jQuery events to subscribe and trigger events internal to search
                $event = $({}),
                
            // A function that is executed whenever the filter UI is dismissed.
            // This is used to apply the selected filters.
                onFilterDismissFunction,

            // A collection of search results and corresponding DOM objects that need to be resorted
            // when the page text is available for the page of the search result.
                searchResultsToResort = [],

            // Track whether or not we are searching the document text. This is used to improve search result display
            // for highlights.
                searchingInDocument = false,
                
            // Check if advanced search is on. The default is off
                advancedSearchIsOn = false;
            
            // Initialize the module by attaching UI event handlers and building data structures to
            // hold predefined search terms.
            var init = function () {
                viewer.viewerNodes.$searchStatus.on('click', '[data-pcc-search=msg]', function () {
                    viewer.notify({
                        message: this.getAttribute('data-msg')
                    });
                });
                
                if (viewer.viewerControlOptions.uiElements && viewer.viewerControlOptions.uiElements.advancedSearch === true) {
                    advancedSearchIsOn = true;
                }

                if (typeof viewer.presetSearch !== 'undefined' &&
                    viewer.presetSearch !== null &&
                    Object.prototype.toString.call(viewer.presetSearch.terms) === '[object Array]' &&
                    viewer.presetSearch.terms.length) {

                    buildPresetTerms();
                    buildPresetUI();

                    viewer.viewerNodes.$searchPresetsContainer.on('click', 'label', function (ev) {
                        // stop this from closing the dropdown
                        ev.stopPropagation();
                    });
                } else {
                    viewer.$dom.find('[data-pcc-toggle=dropdown-search-patterns]').hide();
                }

                setUIElementsSearch();

                viewer.viewerNodes.$searchCloser.on('click', function () {
                    viewer.$dom.find('[data-pcc-toggle="dialog-search"]').trigger('click');
                });
                
                // populate redaction reasons filter view
                if (viewer.viewerControlOptions && viewer.viewerControlOptions.redactionReasons) {
                    var fragment = document.createDocumentFragment(),
                        $container = $('[data-pcc-filter-redaction-reasons]');
                    
                    // Get all reasons from the viewer options
                    var reasons = [].concat(viewer.viewerControlOptions.redactionReasons.reasons)
                                    // Add the case where no reason was defined
                                    .concat([{ reason: viewer.language.searchFilters.reasonUndefined }]);
                    
                    // Display all reasons in the filter UI
                    _.forEach(reasons, function(obj){
                        var textNode = document.createTextNode(obj.reason),
                            div = resultView.elem('div', { className: 'pcc-search-filter pcc-filter-marks pcc-checked' }),
                            checkbox = resultView.elem('span', { className: 'pcc-checkbox' });
                        
                        div.setAttribute('data-pcc-search-in-marks', 'reason:' + obj.reason);
                        
                        div.appendChild(checkbox);
                        div.appendChild(textNode);
                        
                        fragment.appendChild(div);
                    });
                    
                    $container.empty();
                    $container.append(fragment);
                }
            };

            $event.on('selectResult', function(ev, data){
                // set the active search result node
                $activeSearchResult = $(data.node);

                // deselect a previously selected result in the search UI
                viewer.viewerNodes.$searchResults.find('.pcc-row.pcc-active').removeClass('pcc-active');
                // select the new result
                $activeSearchResult.addClass('pcc-active');
                // deselect marks that may have been selected from a previous result
                viewer.viewerControl.deselectAllMarks();
                // deselect document search results that may have been selected from a previous result
                viewer.viewerControl.setSelectedSearchResult(null);
                // deselect any comment that may have been selected from a previous result
                $event.trigger('deselectPreviousResult');

                // update search UI to reflect selection
                updatePrevNextButtons();

                var index = $activeSearchResult.index() + 1,
                    total = searchResultsCount;

                viewer.viewerNodes.$searchResultCount.html('Viewing Result ' + index + ' of ' + total);
                
                // hide results panel on mobile viewports
                viewer.viewerNodes.$searchResultsContainer.addClass('pcc-hide');
                // collapse the expanded panel
                viewer.viewerNodes.$searchDialog.removeClass('pcc-expand')
                      // switch the active results button to off state
                      .find('[data-pcc-search-container-toggle="results"]').removeClass('pcc-active');
            });

            // Generates HTML Elements for various results that can exist in the search bar.
            var resultView = {
                elem: function(type, opts){
                    opts = opts || {};
                    var elem = document.createElement(type || 'div');
                    if (typeof opts.className === 'string') {
                        elem.className = opts.className;
                    }
                    if (typeof opts.text !== 'undefined') {
                        // Sanitize the text being inserted into the DOM
                        elem.appendChild( document.createTextNode(opts.text.toString()) );
                    }
                    return elem;
                },
                textContext: function(result) {
                    var contextElem, emphasis, textBefore, textAfter;

                    var contextClassName = advancedSearchIsOn ? 'pcc-col-8' : 'pcc-col-10';
                    contextElem = resultView.elem('div', { className: contextClassName });

                    // make the selected text interesting
                    emphasis = resultView.elem('span', { className: 'match', text: result.getText() });
                    emphasis.style.color = result.getHighlightColor();

                    // get the text before and after the search hit
                    textBefore = result.getContext().substr(0, result.getStartIndexInContext());
                    textAfter = result.getContext().substr(result.getText().length + result.getStartIndexInContext());

                    // append the text nodes
                    // avoid adding blank text nodes
                    if (textBefore) {
                        contextElem.appendChild( document.createTextNode('...' + textBefore) );
                    }
                    contextElem.appendChild( emphasis );
                    if (textAfter) {
                        contextElem.appendChild( document.createTextNode(textAfter + '...') );
                    }

                    return contextElem;
                },
                pageNumber: function(number){
                    return resultView.elem('div', { className: 'pcc-col-2 pcc-center', text: number });
                },
                typeIcon: function(){
                    var result = null;
                    if(options.uiElements && options.uiElements.advancedSearch){
                        result = resultView.elem('div', { className: 'pcc-search-type' });
                    }
                    else {
                        result = resultView.elem('div');
                    }
                    return result;
                },
                searchResult: function(result){
                    var searchResult, searchResultPageNumber, searchResultContext;

                    searchResult = resultView.elem('div', { className: 'pcc-row' });
                    searchResult.setAttribute('data-pcc-search-result-id', result.getId());

                    searchResultPageNumber = resultView.pageNumber( result.getPageNumber() );

                    searchResultContext = resultView.textContext(result);

                    searchResult.appendChild(searchResultPageNumber);
                    searchResult.appendChild(searchResultContext);
                    searchResult.appendChild( resultView.typeIcon() );

                    $(searchResult).on('click', function () {
                        $event.trigger('selectResult', {
                            type: 'search',
                            result: result,
                            node: searchResult
                        });

                        viewer.viewerControl.setSelectedSearchResult(result, true);
                    });

                    return searchResult;
                },
                mark: function(result){
                    var mark = result.source,
                        text = viewer.language.markType[mark.getType()],
                        type = getSearchResultType(result);

                    // check if a line annotation is actually an arrow
                    if (mark.getType() === PCCViewer.Mark.Type.LineAnnotation && mark.getEndHeadType() === PCCViewer.Mark.LineHeadType.FilledTriangle){
                        text = viewer.language.markType["ArrowAnnotation"];
                    }
                    
                    if (type === 'redaction' && mark.getReason) {
                        var reason = mark.getReason() || viewer.language.searchFilters.reasonUndefined;
                        text += ' - ' + reason;
                    }

                    var resultElem = resultView.elem('div', { className: 'pcc-row' }),
                        resultPageNumber = resultView.pageNumber( mark.getPageNumber() ),
                        resultContext;
                    
                    if (result instanceof PCCViewer.SearchTaskResult) {
                        // this result is a text-based mark
                        resultContext = resultView.textContext(result);
                    } else {
                        // this result is a drawing mark
                        var contextClassName = advancedSearchIsOn ? 'pcc-col-8' : 'pcc-col-10';
                        resultContext = resultView.elem('div', { className: contextClassName, text: text });
                    }
                    
                    resultElem.appendChild(resultPageNumber);
                    resultElem.appendChild(resultContext);
                    resultElem.appendChild( resultView.typeIcon() );

                    $(resultElem).on('click', function(){
                        $event.trigger('selectResult', {
                            type: 'mark',
                            result: result,
                            node: resultElem
                        });

                        // select this mark and scroll to it
                        if (viewer.viewerControl.getMarkById(mark.getId())) {
                            viewer.viewerControl.selectMarks([mark]);
                            viewer.viewerControl.scrollTo(mark);

                            // Darken the matching text of the search result within the mark
                            highlightMatchingTextInMark(mark, result);
                        }

                        // register an event to deselect the selectedResult when another result is selected
                        // this will execute only once, on the first result select
                        $event.one('deselectPreviousResult', function () {
                            // check that this mark still exists
                            if (viewer.viewerControl.getMarkById(mark.getId())) {
                                highlightMatchingTextInMark(mark);
                            }
                        });
                    });

                    return resultElem;
                },
                comment: function(result){
                    var comment = result.source,
                        resultElem = resultView.elem('div', { className: 'pcc-row' }),
                        resultPageNumber = resultView.pageNumber( result.getPageNumber() ),
                        resultContext = resultView.textContext(result);

                    resultElem.appendChild(resultPageNumber);
                    resultElem.appendChild(resultContext);
                    resultElem.appendChild( resultView.typeIcon() );

                    $(resultElem).on('click', function(){
                        $event.trigger('selectResult', {
                            type: 'comment',
                            result: result,
                            node: resultElem
                        });
                        
                        // find all search results for this comment
                        var thisCommentResults = _.filter(searchResults, function(el){
                            return el.source && el.source === result.source;
                        });
                        
                        // select this comment
                        comment.setData('Accusoft-highlight', buildCommentSelectionString(thisCommentResults, result));
                        
                        // re-render the conversation view with the highlight in effect
                        if (viewer.viewerControl.getMarkById(comment.getConversation().getMark().getId())) {
                            viewer.viewerControl.refreshConversations(comment.getConversation());

                            // select the related mark conversation
                            viewer.viewerControl.selectMarks([ comment.getConversation().getMark() ]);

                            // scroll to the comment
                            if (viewer.viewerControl.getIsCommentsPanelOpen() === false) {
                                viewer.viewerControl.openCommentsPanel();
                            }
                            viewer.viewerControl.scrollTo(comment.getConversation());

                            // register an event to deselect this comment when another result is selected
                            // this will execute only once, on the first result select
                            $event.one('deselectPreviousResult', function(){
                                comment.setData('Accusoft-highlight', buildCommentSelectionString(thisCommentResults));

                                // check that this mark still exists
                                if (viewer.viewerControl.getMarkById( comment.getConversation().getMark().getId()) ){
                                    viewer.viewerControl.refreshConversations(comment.getConversation());
                                }
                            });
                        }
                    });

                    return resultElem;
                },
                select: function(result){
                    if (result instanceof PCCViewer.SearchResult) {
                        return resultView.searchResult(result);
                    } else if (result instanceof PCCViewer.SearchTaskResult && result.source instanceof PCCViewer.Comment) {
                        return resultView.comment(result);
                    } else {
                        return resultView.mark(result);
                    }
                }
            };
            
            // Builds a selection string from a list of comment search results.
            // If a selected result is present, that result will be highlighted differently.
            var buildCommentSelectionString = function (thisCommentResults, selectedResult) {
                return _.reduce(thisCommentResults, function(seed, el) {
                    seed.push(['startIndex=' + el.getStartIndexInInput(),
                               'length=' + el.getText().length, 
                               'color=' + el.getHighlightColor(),
                               'opacity=' + ((el === selectedResult) ? 200 : 100)].join('&'));
                    return seed;
                }, []).join('|');
            };
            
            // Performs a highlight on all of the comment search results in a given collection
            var showAllCommentResults = function(collection){
                var conversations = _.chain(collection).filter(function(el){
                    // find all results in the collection that belong to comments
                    return (el.source && el.source instanceof PCCViewer.Comment);
                }).reduce(function(seed, el){
                    // create collections of each unique comment and all of its selections
                    // one comment can have multiple selections in it
                    var thisCollection = _.find(seed, function(val){
                        return val.source === el.source;
                    });
                    
                    if (thisCollection) {
                        thisCollection.selections.push(el);
                    } else {
                        thisCollection = {
                            source: el.source,
                            selections: [el]
                        };
                        seed.push(thisCollection);
                    }
                    
                    return seed;
                }, []).map(function(el){
                    // build selection strings for each unique comment
                    el.selectionString = buildCommentSelectionString(el.selections);
                    // assign the selection string to be rendered
                    el.source.setData('Accusoft-highlight', el.selectionString);
                    // return the conversation
                    return el.source.getConversation();
                }).value();
                
                if (conversations.length) {
                    viewer.viewerControl.refreshConversations(conversations);
                }
            };

            // Highlights all search results within the given mark.
            // If selectedResult is passed, then the highlight for that
            // result will be more opaque, making it appear darker in the UI.
            var highlightMatchingTextInMark = function(mark, selectedResult) {
                // Exit without highlighting if given a mark that cannot be highlighted.
                if (!mark || !mark.highlightText) {
                    return;
                }

                // find all text search results for this mark
                var thisMarkResults = _.filter(searchResults, function(el){
                    return (el.source && el.source === mark) &&
                        (el instanceof PCCViewer.SearchTaskResult);
                });

                // Transform these mark search results into an object
                // that is accepted by highlightText.
                thisMarkResults = _.map(thisMarkResults, function(el) {
                    return {
                        startIndex: el.getStartIndexInInput(),
                        length: el.getText().length,
                        color: el.getHighlightColor(),
                        // Reduce the opacity of search result highlights within highlight annotations, when
                        // also searching in document text. This avoids a triple or quad highlight of the
                        // matching text.
                        opacity: (!searchingInDocument || mark.getType() !== PCCViewer.Mark.Type.HighlightAnnotation) ?
                            ((el === selectedResult) ? 200 : 100) :
                            ((el === selectedResult) ? 100 : 0)
                    };
                });

                // highlight text in the mark - this will replace any existing highlights in the mark
                mark.highlightText(thisMarkResults);
            };

            // Performs a highlight on all of the Mark search results in a given collection
            var highlightMatchingTextInMarkResults = function(results) {
                var allMarksWithResults = _.chain(results)
                    .filter(function(result) {
                        return (result.source && result.source instanceof PCCViewer.Mark);
                    })
                    .map(function(result) {
                        return result.source;
                    })
                    .unique().value();

                _.each(allMarksWithResults, function(mark) {
                    highlightMatchingTextInMark(mark);
                });
            };
            
            // Clear the selection of all comment results in a given collection
            var clearAllCommentResults = function(collection){
                var uniqueConversations = [];
                
                var conversations = _.chain(collection).filter(function(el){
                    // find all results in the collection that belong to comments
                    return (el.source && el.source instanceof PCCViewer.Comment && el.source.getData('Accusoft-highlight'));
                }).map(function(el){
                    // push conversations to the unique array if they are not already in there
                    if (!_.contains(uniqueConversations, el.source.getConversation())) {
                        uniqueConversations.push(el.source.getConversation());
                    }
                    
                    // check if there is a highlight to remove
                    el.source.setData('Accusoft-highlight', undefined);
                });
                
                // check in case some marks were deleted before clearing the results
                var conversationStillAvailable = _.filter(uniqueConversations, function(conv){
                    return !!viewer.viewerControl.getMarkById(conv.getMark().getId());
                });
                
                // if there are any conversations to clear, do so
                if (conversationStillAvailable.length) {
                    viewer.viewerControl.refreshConversations(conversationStillAvailable);
                }
            };

            // Clear the selection of all mark results in a given collection
            var clearAllMarkResults = function(collection){
                _.forEach(viewer.viewerControl.getAllMarks(), function(mark){
                    if (mark.clearHighlights) {
                        mark.clearHighlights();
                    }
                });
            };

            // Takes the JSON data from predefinedSearch.json and uses it to create normalized search terms. Those are
            // then added to presetSearchTerms.
            var buildPresetTerms = function () {

                var globalOptions = {},
                    term, normalizedTerm, i = 0,
                    highlightColor;

                if (typeof viewer.presetSearch.globalOptions !== 'undefined') {
                    globalOptions = viewer.presetSearch.globalOptions;
                }

                if (typeof viewer.presetSearch.highlightColor !== 'undefined') {
                    highlightColor = viewer.presetSearch.highlightColor;
                }

                for (i; i < viewer.presetSearch.terms.length; i++) {

                    normalizedTerm = {
                        matchingOptions: {}
                    };

                    term = viewer.presetSearch.terms[i];

                    if (typeof term.userDefinedRegex !== "undefined") {
                        normalizedTerm.searchTermName = term.searchTerm;
                        normalizedTerm.searchTerm = term.userDefinedRegex;
                    } else if (typeof term.searchTerm !== "undefined") {
                        normalizedTerm.searchTerm = term.searchTerm;
                    }

                    if (typeof term.searchTermIsRegex !== "undefined") {
                        normalizedTerm.searchTermIsRegex = term.searchTermIsRegex;
                    } else {
                        normalizedTerm.searchTermIsRegex = false;
                    }

                    if (typeof term.options === "undefined") {
                        term.matchingOptions = {};
                    } else {
                        term.matchingOptions = term.options;
                        delete term.options;
                    }

                    if (typeof term.matchingOptions.matchCase !== "undefined") {
                        normalizedTerm.matchingOptions.matchCase = term.matchingOptions.matchCase;
                    } else if (typeof term.matchingOptions.matchCase === "undefined" && typeof globalOptions.matchCase !== 'undefined') {
                        normalizedTerm.matchingOptions.matchCase = globalOptions.matchCase;
                    }

                    if (typeof term.matchingOptions.endsWith !== "undefined") {
                        normalizedTerm.matchingOptions.endsWith = term.matchingOptions.endsWith;
                    } else if (typeof term.matchingOptions.endsWith === "undefined" && typeof globalOptions.endsWith !== 'undefined') {
                        normalizedTerm.matchingOptions.endsWith = globalOptions.endsWith;
                    }

                    if (typeof term.matchingOptions.beginsWith !== "undefined") {
                        normalizedTerm.matchingOptions.beginsWith = term.matchingOptions.beginsWith;
                    } else if (typeof term.matchingOptions.beginsWith === "undefined" && typeof globalOptions.beginsWith !== 'undefined') {
                        normalizedTerm.matchingOptions.beginsWith = globalOptions.beginsWith;
                    }

                    if (typeof term.matchingOptions.matchWholeWord !== "undefined") {
                        normalizedTerm.matchingOptions.matchWholeWord = term.matchingOptions.matchWholeWord;
                    } else if (typeof term.matchingOptions.matchWholeWord === "undefined" && typeof globalOptions.matchWholeWord !== 'undefined') {
                        normalizedTerm.matchingOptions.matchWholeWord = globalOptions.matchWholeWord;
                    }

                    if (typeof term.matchingOptions.exactPhrase !== "undefined") {
                        normalizedTerm.matchingOptions.exactPhrase = term.matchingOptions.exactPhrase;
                    } else if (typeof term.matchingOptions.exactPhrase === "undefined" && typeof globalOptions.exactPhrase !== 'undefined') {
                        normalizedTerm.matchingOptions.exactPhrase = globalOptions.exactPhrase;
                    }

                    if (typeof term.highlightColor !== "undefined") {
                        normalizedTerm.highlightColor = term.highlightColor;
                    } else if (typeof term.highlightColor === "undefined" && typeof highlightColor !== 'undefined') {
                        normalizedTerm.highlightColor = highlightColor;
                    }

                    presetSearchTerms.push(normalizedTerm);
                }
            };

            // Adds the search items from predefinedSearch.json to the UI in the form of a dropdown selectable list.
            var buildPresetUI = function () {
                var domElems = [],
                    fragment = document.createDocumentFragment(),
                    description, checked;

                function generateDOM(description, id, checked){
                    var label = document.createElement('label'),
                        input = document.createElement('input'),
                        textNode = document.createTextNode(description);

                    input.type = 'checkbox';
                    input.setAttribute('data-pcc-search-preset-id', id);
                    if (checked) {
                        input.setAttribute('checked', 'checked');
                    }

                    label.appendChild(input);
                    label.appendChild(textNode);

                    return label;
                }

                $.each(viewer.presetSearch.terms, function(i, term){
                    checked = (term.selected === true) ? 'checked="checked"' : '';
                    description = (typeof term.description === 'undefined') ? term.searchTerm : term.description;

                    fragment.appendChild( generateDOM(description, i, checked) );
                });

                viewer.viewerNodes.$searchPresetsContainer.append(fragment);
            };

            // When getting ready to execute a search, this functions pulls together all the user selectable
            // search options in to a single search options object.
            var getSearchQuery = function (triggeredFromFilter) {
                // remove leading and trailing spaces, and replace multiple spaces with a single space
                var queryString = viewer.viewerNodes.$searchInput.val().replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' '),
                    i = 0,
                    presetId, searchTerms = [],
                    isPlaceholder = viewer.viewerNodes.$searchInput.hasClass('pcc-placeholder');

                var matchingOptions = {
                    exactPhrase: viewer.viewerNodes.$searchExactPhrase.hasClass('pcc-active') ? true : false,
                    matchCase: viewer.viewerNodes.$searchMatchCase.hasClass('pcc-active') ? true : false,
                    matchWholeWord: viewer.viewerNodes.$searchMatchWholeWord.hasClass('pcc-active') ? true : false,
                    beginsWith: viewer.viewerNodes.$searchBeginsWith.hasClass('pcc-active') ? true : false,
                    endsWith: viewer.viewerNodes.$searchEndsWith.hasClass('pcc-active') ? true : false,
                    wildcard: viewer.viewerNodes.$searchWildcard.hasClass('pcc-active') ? true : false
                };
                
                privateSimpleSearch = true;
                
                if (triggeredFromFilter) {
                    // This is a request for a searchQuery based on applied filters.
                    
                    // check if the new matching options are the same as the previous ones used in the UI
                    // the user may have changed them before applying a filter
                    var sameMatchingOptions = _.isEqual(matchingOptions, prevMatchingOptions);
                    
                    // get selected terms from the UI
                    var checkedTerms = $('[data-pcc-section="searchTerms"]').find('.pcc-checked');
                    
                    if (checkedTerms.length === 0) {
                        // no terms are checked, yet we are running a filter...
                        // check if there are any terms present in the first place
                        var allTerms = $('[data-pcc-section="searchTerms"]').find('.pcc-filter-term');
                        
                        if (allTerms.length === 0) {
                            // this is a filter search (exact same terms) where there were no hits the first time,
                            // so we want to run all terms again
                            return getSearchQuery(false);
                        }
                    }
                    
                    // reset all term options to not be used
                    // also add new UI matching options to user-search terms
                    _.forEach(globalSearchTerms, function(termOption){
                        termOption.isInUse = false;
                        
                        if (!sameMatchingOptions && termOption.isUserSearch) {
                            // relpace the matching options
                            termOption.searchOption.matchingOptions = matchingOptions;
                        }
                    });

                    if (!sameMatchingOptions) {
                        prevMatchingOptions = _.clone(matchingOptions);
                    }
                    
                    var tempTermsArray = _.map(checkedTerms, function(el){
                        var term = el.getAttribute('data-pcc-filter-term'),
                            searchTerm = globalSearchTerms[term];

                        searchTerm.isInUse = true;
                        
                        return searchTerm.searchOption;
                    });
                    
                    searchTerms = tempTermsArray;
                } else if (isPlaceholder) {
                    // This is a request for a new search, but there is no real text in the input field. This is a 
                    // state triggered by the placeholder polyfill. Treat this as a search with no terms.
                    return {
                        searchTerms: []
                    };
                } else {
                    // This is a request for a new searchQuery triggered by the search input field.
                    // Generate new search terms, and save them globally.
                    prevMatchingOptions = _.clone(matchingOptions);
                    
                    if (matchingOptions.exactPhrase) {
                        // We need to match the exact string, as is
                        if (queryString.length) {
                            searchTerms.push({
                                searchTerm: queryString,
                                highlightColor: undefined,
                                searchTermIsRegex: false,
                                contextPadding: 25,
                                matchingOptions: matchingOptions
                            });
                        }
                    } else {
                        // Split up multiple words in the string into separate search term objects
                        var queryArr = queryString.split(' ');
                        _.forEach(queryArr, function(query){
                            if (query.length) {
                                searchTerms.push({
                                    searchTerm: query,
                                    highlightColor: undefined,
                                    searchTermIsRegex: false,
                                    contextPadding: 25,
                                    matchingOptions: matchingOptions
                                });
                            }
                        });
                    }

                    // mark search terms as UI-triggered
                    _.forEach(searchTerms, function(term){
                        term.isUserSearch = true;
                    });
                    
                    // add preset searched to the terms list
                    if (presetSearchTerms.length) {
                        viewer.$dom.find('input:checked').each(function(i, el){
                            privateSimpleSearch = false;
                            presetId = $(el).data('pccSearchPresetId');
                            searchTerms.push(presetSearchTerms[presetId]);
                        });
                    }
                    
                    // replace the global query with this new generated one
                    _.forEach(searchTerms, function(term){
                        var searchTerm = term.searchTerm;
                        var saveObject = {
                            searchOption: term,
                            prettyName: term.searchTermName || term.searchTerm,
                            prevCount: undefined,
                            isInUse: true,
                            isUserSearch: !!term.isUserSearch
                        };

                        globalSearchTerms[searchTerm] = saveObject;
                    });
                    
                    addPreviousSearch({ searchTerm: queryString, matchingOptions: matchingOptions });
                }
                
                return {
                    searchTerms: searchTerms
                };
            };

            // This function adds a search query to a UI list of previously executed search terms. Selecting an item
            // from the list will cause it to be re-executed.
            var addPreviousSearch = function (searchTerm) {
                var previousNode,
                    $elPrevSearchDrop = viewer.viewerNodes.$searchPreviousContainer;

                if (typeof previousSearches[searchTerm.searchTerm] !== 'undefined') {
                    return;
                }

                previousSearches[searchTerm.searchTerm] = searchTerm;

                $elPrevSearchDrop.find('.pcc-placeholder').addClass('pcc-hide');

                var root = document.createElement('div'),
                    text = document.createElement('div'),
                    button = document.createElement('div'),
                    textNode = document.createTextNode(searchTerm.searchTerm);

                text.className = 'pcc-search-previous-query';
                text.setAttribute('data-pcc-search-previous-id', searchTerm.searchTerm);
                text.appendChild(textNode);

                button.innerHTML = '&#215;';
                button.setAttribute('data-pcc-search-previous-id', searchTerm.searchTerm);
                button.className = 'pcc-remove-previous';

                root.appendChild(text);
                root.appendChild(button);

                $(text).on('click', function () {
                    previousSelectionHandler(this);
                });

                // execute this only once
                $(button).one('click', function (ev) {
                    ev.stopPropagation();
                    deletePreviousSearch(this);
                });
                
                $elPrevSearchDrop.prepend(root);
            };

            // When a user selects a previous search query from a list, this function will cause the search to be re-executed.
            var previousSelectionHandler = function (searchNode) {
                var searchTerm,
                    index = searchNode.getAttribute('data-pcc-search-previous-id');

                searchTerm = previousSearches[index];

                viewer.viewerNodes.$searchInput.val(searchTerm.searchTerm);

                setSearchButtons(searchTerm.matchingOptions);

                viewer.viewerNodes.$searchSubmit.click();
            };

            // This function sets the toggle state of the various search option buttons. The state is determined by the
            // btnStates object.
            var setSearchButtons = function (btnStates) {
                if ((btnStates.exactPhrase === true && !viewer.viewerNodes.$searchExactPhrase.hasClass('pcc-active')) ||
                    (btnStates.exactPhrase === false &&
                        viewer.viewerNodes.$searchExactPhrase.hasClass('pcc-active'))) {
                    viewer.viewerNodes.$searchExactPhrase.click();
                }

                if ((btnStates.matchCase === true && !viewer.viewerNodes.$searchMatchCase.hasClass('pcc-active')) ||
                    (btnStates.matchCase === false &&
                        viewer.viewerNodes.$searchMatchCase.hasClass('pcc-active'))) {
                    viewer.viewerNodes.$searchMatchCase.click();
                }

                if ((btnStates.matchWholeWord === true && !viewer.viewerNodes.$searchMatchWholeWord.hasClass('pcc-active')) ||
                    (btnStates.matchWholeWord === false &&
                        viewer.viewerNodes.$searchMatchWholeWord.hasClass('pcc-active'))) {
                    viewer.viewerNodes.$searchMatchWholeWord.click();
                }

                if ((btnStates.beginsWith === true && !viewer.viewerNodes.$searchBeginsWith.hasClass('pcc-active')) ||
                    (btnStates.beginsWith === false &&
                        viewer.viewerNodes.$searchBeginsWith.hasClass('pcc-active'))) {
                    viewer.viewerNodes.$searchBeginsWith.click();
                }

                if ((btnStates.endsWith === true && !viewer.viewerNodes.$searchEndsWith.hasClass('pcc-active')) ||
                    (btnStates.endsWith === false &&
                        viewer.viewerNodes.$searchEndsWith.hasClass('pcc-active'))) {
                    viewer.viewerNodes.$searchEndsWith.click();
                }

                if ((btnStates.wildcard === true && !viewer.viewerNodes.$searchWildcard.hasClass('pcc-active')) ||
                    (btnStates.wildcard === false &&
                        viewer.viewerNodes.$searchWildcard.hasClass('pcc-active'))) {
                    viewer.viewerNodes.$searchWildcard.click();
                }
            };

            // When the user selects the delete icon next to a previous search query, this function will remove
            // it from the displayed list.
            var deletePreviousSearch = function (el) {
                var $parent = $(el).parent(),
                    previousId = $(el).attr("data-pcc-search-previous-id");

                $parent.remove();

                delete previousSearches[previousId];
                
                if (_.keys(previousSearches).length === 0) {
                    // there are no previous searches
                    viewer.viewerNodes.$searchPreviousContainer.find('.pcc-placeholder').removeClass('pcc-hide');
                }
            };

            // This function causes the search bar to be displayed.
            var showSearchBar = function () {
                viewer.$dom.find('.pcc-row-results-status').removeClass('pcc-done');

                viewer.viewerNodes.$searchResultCount.html('Searching...');
                
                viewer.$dom.find('[data-pcc-toggle*="dialog"].pcc-active').removeClass('pcc-active');
                viewer.$dom.find('[data-pcc-toggle="dialog-search"]').addClass('pcc-active');

                viewer.viewerNodes.$searchDialog.addClass('pcc-open').find('button').prop('disabled', false);
                
                // offset the context menu on mobile viewports
                viewer.viewerNodes.$contextMenu.addClass('pcc-move');
                
                toggleDialogOffset({fitContent: false});
                if (typeof viewer.activeFitType !== 'undefined') { viewer.viewerControl.fitContent(viewer.activeFitType); }
            };

            // As search results are returned to the viewer, this functions can update the progress bar as well as
            // display a text message reflecting the status of the search.
            var updateStatusUi = function (msg, showLoader, barWidth) {
                if (msg.length) {
                    viewer.viewerNodes.$searchResultCount.html(msg);
                }

                if (typeof showLoader === 'boolean' && showLoader === true) {
                    viewer.viewerNodes.$searchStatus.show();
                } else {
                    viewer.viewerNodes.$searchStatus.hide();
                }

                if (typeof barWidth === 'number') {

                    if (barWidth < 0) {
                        barWidth = 0;
                    } else if (barWidth > 100) {
                        barWidth = 100;
                    }

                    viewer.$dom.find('.pcc-row-results-status .pcc-bar').css('width', barWidth + '%');
                }
            };

            // Sorts an array of live DOM elements (already in the DOM)
            // It will also work with a jQuery-wrapped array
            var sortDOM = (function(){
                var sort = [].sort;

                return function(elems, comparator) {
                    // Sort the elements.
                    // Make sure to get the pure elements array out of the jQuery wrapper.
                    var sortCollection = sort.call($(elems).get(), comparator);

                    // Check to make sure we have items in the collection
                    if (sortCollection.length === 0) {
                        return;
                    }

                    // Save the first element, and insert it as the first
                    var prev = sortCollection.shift();
                    $(prev).insertBefore(prev.parentNode.firstChild);

                    // Insert the rest of the elements in order
                    $(sortCollection).each(function(i, el) {
                        //$(el).insertAfter(prev);
                        el.parentNode.insertBefore(el, prev.nextSibling);
                        prev = el;
                    });
                };
            })();

            var getSearchResultType = function(result) {
                if (result instanceof PCCViewer.SearchResult) {
                    return 'search';
                }

                if (result.source && result.source instanceof PCCViewer.Mark) {
                    var type = result.source.getType();

                    if (type.match(/redaction/i)) { return 'redaction'; }
                    else if (type.match(/annotation/i)) { return 'annotation'; }
                    else if (type.match(/signature/i)) { return 'signature'; }
                }

                if (result.source && result.source instanceof PCCViewer.Comment) {
                    return 'comment';
                }

                return 'unknown';
            };

            // This function will sort the search results DOM elements, and fir the even/odd classnames.
            // It can be a bit slow for large result sets, so it should be throttled when executing in a loop.
            var sortAndColorCorrectResultsView = function(){
                // Sort the live DOM elements
                sortDOM(viewer.viewerNodes.$searchResults.children(), function(a, b){
                    function getDataFromAttributes($e) {
                        return {
                            pccPageNumber : $e.attr("data-pcc-page-number"),
                            pccSortIndex : $e.attr("data-pcc-sort-index"),
                            pccRectY : $e.attr("data-pcc-rect-y"),
                            pccRectX : $e.attr("data-pcc-rect-x"),
                            pccAdtlIndex : $e.attr("data-pcc-adtl-index")
                        };
                    }

                    // get the data attributes out of the DOM
                    var aData = getDataFromAttributes($(a));
                    var bData = getDataFromAttributes($(b));

                    // sort based on the sorting attributes
                    return (aData.pccPageNumber !== bData.pccPageNumber) ? aData.pccPageNumber - bData.pccPageNumber :
                           (aData.pccSortIndex !== bData.pccSortIndex) ? aData.pccSortIndex - bData.pccSortIndex :
                           (aData.pccRectY !== bData.pccRectY) ? aData.pccRectY - bData.pccRectY :
                           (aData.pccRectX !== bData.pccRectX) ? aData.pccRectX - bData.pccRectX : 
                           (aData.pccAdtlIndex !== bData.pccAdtlIndex) ? aData.pccAdtlIndex - bData.pccAdtlIndex : 0;
                });

                // The order of DOM elements has changed, so add and remove .pcc-odd class as needed
                viewer.viewerNodes.$searchResults.find('.pcc-row:even').removeClass('pcc-odd');
                viewer.viewerNodes.$searchResults.find('.pcc-row:odd').addClass('pcc-odd');
            };
            
            // Appends to the results view given partial results.
            // This function will throttle DOM building and sorting for large amounts of data.
            var partialResultsTimeout,
                delayCount = 0;
            var buildPartialResultsView = function(partialSearchResults) {
                var fragment = document.createDocumentFragment(),
                    rectangle = {},
                    typeClass = '',
                    searchResult, resultsVerbiage;

                _.each(partialSearchResults, function(result){
                    // Get a DOM view element for this result
                    searchResult = resultView.select(result);

                    typeClass = 'pcc-search-result-' + getSearchResultType(result);
                    $(searchResult).addClass(typeClass);

                    // Get the primary sort index for this search result.
                    var sortIndex = (result.index !== undefined) ? result.index : result.getStartIndexInPage();

                    // If the sort index is equal to -2, then this is a mark or comment search result and
                    // we want to resort it based on position relative to page text.
                    if (sortIndex === -2 && result.index === -2) {
                        searchResultsToResort.push({
                                domElement: searchResult,
                                searchResult: result
                            }
                        );

                        // Ensure that the ViewerControl is requesting text for the page of this search result.
                        ensurePageTextIsRequested(result.getPageNumber());
                    }

                    // Add sorting parameters to the DOM element
                    searchResult.setAttribute('data-pcc-page-number', result.getPageNumber());
                    searchResult.setAttribute('data-pcc-sort-index', sortIndex);

                    // Add an additional sorting parameter to use for multiple hits in one object
                    var additionalIndex = (result instanceof PCCViewer.SearchResult) ? result.getStartIndexInPage() :
                                          (result instanceof PCCViewer.SearchTaskResult) ? result.getStartIndexInInput() : 0;
                    searchResult.setAttribute('data-pcc-adtl-index', additionalIndex);

                    rectangle = result.getBoundingRectangle();
                    searchResult.setAttribute('data-pcc-rect-x', rectangle.x);
                    searchResult.setAttribute('data-pcc-rect-y', rectangle.y);

                    fragment.appendChild(searchResult);

                    searchResultsCount++;

                    resultsVerbiage = (searchResultsCount === 1) ? ' Result Found.' : ' Results Found.';

                    updateStatusUi(searchResultsCount + resultsVerbiage, true, 100 * (result.getPageNumber() / viewer.pageCount));
                });

                // Add new results to the end of the DOM
                viewer.viewerNodes.$searchResults.append(fragment);

                // Display relatively small result sets immediately.
                if (searchResults.length < 50) {
                    sortAndColorCorrectResultsView();
                } else {
                    // Gradually build up the trottle.
                    // The user will see the first results right away, and the 
                    // bottom of the list will populate a little more slowly. This
                    // avoids expensive rendering by the browser when the user can't
                    // see the effects.
                    var delay = Math.min(200 * (delayCount), 1000);
                    delayCount += 1;
                    if (partialResultsTimeout) {
                        clearTimeout(partialResultsTimeout);
                        partialResultsTimeout = undefined;
                    }

                    partialResultsTimeout = setTimeout(sortAndColorCorrectResultsView, delay);
                }
            };
            
            // Triggered when a partial set of search results is available. This triggers one final time before the
            // search completes. Properties appended to the event object: .partialSearchResults
            var partialSearchResultHandler = function (ev) {
                
                // append the partial results to the results collection
                searchResults.push.apply(searchResults, ev.partialSearchResults);
                
                buildPartialResultsView(ev.partialSearchResults);

                // Update the filter UI if results were added
                if (ev.partialSearchResults && ev.partialSearchResults.length) {
                    populateSearchTermsFilter(prevSearchQuery, searchResults);
                }
            };

            // Triggered when search has completed due to failure, abort, or when the full set of search results is available.
            var searchCompletedHandler = function (ev) {
                unHookSearchResultEvents();

                var resultsVerbiage = (searchResultsCount === 0) ? 'Nothing Found' : '',
                    pagesWithoutTextMsg = '',
                    countPagesWithoutText, pageWording, pagesWithoutTextWarning = '';

                updateStatusUi(resultsVerbiage, false, 100);

                viewer.viewerNodes.$searchCancel.addClass('pcc-hide');
                viewer.viewerNodes.$searchSubmit.removeClass('pcc-hide');
                viewer.viewerNodes.$searchStatus.addClass('pcc-done');

                if (!searchResultsCount) {
                    viewer.viewerNodes.$searchResultsContainer.removeClass('pcc-show-lg');
                } else {
                    viewer.viewerNodes.$searchResultsContainer.addClass('pcc-show-lg');
                }

                countPagesWithoutText = searchRequest.getPagesWithoutText ? searchRequest.getPagesWithoutText().length : 0;

                if (viewer.pageCount === countPagesWithoutText) {
                    pagesWithoutTextWarning = viewer.language.noSearchableText;

                    viewer.viewerNodes.$searchInput.attr("disabled", "disabled");
                    viewer.viewerNodes.$searchSubmit.attr("disabled", "disabled");

                } else if (countPagesWithoutText > 0) {

                    var currentSearchStatusWording = viewer.viewerNodes.$searchResultCount.html();

                    pagesWithoutTextMsg = countPagesWithoutText + ' ' + viewer.language.cannotSearch;

                    pagesWithoutTextWarning = currentSearchStatusWording + '<span class="pcc-icon pcc-icon-alert" data-pcc-search="msg" data-msg="{{MSG}}"></span>'
                        .replace('{{MSG}}', pagesWithoutTextMsg);

                }

                if (pagesWithoutTextWarning.length) {
                    updateStatusUi(pagesWithoutTextWarning, false, 100);
                }
            };

            // Triggered when the search has completed due to failure.
            var searchFailedHandler = function (ev) {
                var msg = "An error occured during search. " + searchRequest.getErrorMessage();

                unHookSearchResultEvents();
                updateStatusUi('Search Failed', false, 100);

                viewer.viewerNodes.$searchCancel.addClass('pcc-hide');
                viewer.viewerNodes.$searchSubmit.removeClass('pcc-hide');

                viewer.notify({
                    message: msg
                });
            };

            // Triggered when the search has completed due to a call to cancel.
            var searchCancelledHandler = function (ev) {
                unHookSearchResultEvents();
                updateStatusUi('Search Cancelled', false, 100);

                viewer.viewerNodes.$searchCancel.addClass('pcc-hide');
                viewer.viewerNodes.$searchSubmit.removeClass('pcc-hide');
            };

            // Depending on if search results are available, the Next and Previous navigation buttons will be toggled
            // either on or off.
            var updateSearchNavButtons = function () {
                if (searchResultsCount <= 1) {
                    viewer.viewerNodes.$searchNextResult.attr('disabled', 'disabled');
                    viewer.viewerNodes.$searchPrevResult.attr('disabled', 'disabled');
                } else {
                    viewer.viewerNodes.$searchNextResult.removeAttr('disabled');
                    viewer.viewerNodes.$searchPrevResult.removeAttr('disabled');
                }
            };

            // Triggered when the search has completed because the full set of search results is available.
            var searchResultsAvailableHandler = function () {
                unHookSearchResultEvents();

                updateStatusUi('', false, 100);
                updateSearchNavButtons();
            };

            // Detaches all event associated with executing a search.
            var unHookSearchResultEvents = function () {
                if (searchRequest instanceof PCCViewer.SearchRequest) {
                    searchRequest.off('PartialSearchResultsAvailable', partialSearchResultHandler);
                    searchRequest.off('SearchCompleted', partialSearchResultHandler);
                    searchRequest.off('SearchFailed', searchFailedHandler);
                    searchRequest.off('SearchAborted', searchCancelledHandler);
                    searchRequest.off('SearchResultsAvailable', searchResultsAvailableHandler);    
                }
            };

            // Resets the module's properties used to track search results.
            var resetSearchParams = function () {
                searchResultsCount = 0;
                $activeSearchResult = undefined;
            };

            // If the viewer's searchOnInit options is set to true, then this function will cause a search to be executed.
            var initialSearchHandler = function () {
                if (viewer.presetSearch.searchOnInit === true) {
                    viewer.presetSearch.searchOnInit = false; // only fire once
                    setTimeout(function () {
                        viewer.viewerNodes.$searchSubmit.click();
                    }, 1200);
                }
            };
            
            var populateSearchTermsFilter = function(searchQuery, results) {
                var fragment = document.createDocumentFragment(),
                    $container = $('[data-pcc-section=searchTerms] .pcc-section-content');
                
                $container.empty();
                
                // get count of results by term
                var resultsByTerm = _.reduce(results, function(seed, res){
                    // filter out marks search from filters view
                    if (res.getSearchTerm) {
                        var termOptions = res.getSearchTerm(),
                            term = '',
                            prettyName = '';
                        
                        term = termOptions.searchTerm;
                        prettyName = globalSearchTerms[term].prettyName;
                        
                        seed[term] = seed[term] || { 
                            count: 0, 
                            color: res.getHighlightColor(), 
                            prettyName: prettyName,
                            originalTerm: term
                        };
                        
                        seed[term].count += 1;
                    }
                    
                    return seed;
                }, {});
                
                // Display the processed terms and counts in the filters view
                _.forEach(globalSearchTerms, function(globalResultElem, termName) {
                    var localResultElem = resultsByTerm[termName],
                        localColor = '#ffffff',
                        localCount = 0,
                        persistColor = true;
                    
                    if (localResultElem) {
                        // This term has hits in the current search
                        localCount = localResultElem.count;
                        localColor = localResultElem.color || localColor;
                    } else if (!globalResultElem.isInUse) {
                        // This term was not used, so we need to keep its previous data
                        localCount = globalResultElem.prevCount;
                        localColor = globalResultElem.searchOption.highlightColor || localColor;
                    } else {
                        // This term has no hits in this
                        localCount = 0;
                        localColor = globalResultElem.searchOption.highlightColor || localColor;
                        
                        // do not persist colors in this case, since the color has not been assigned yet
                        persistColor = false;
                    }
                    
                    // Persist new count and auto-assigned colors in the global search term objects
                    globalResultElem.prevCount = localCount;
                    if (persistColor) {
                        globalResultElem.searchOption.highlightColor = localColor;
                    }
                    
                    var divClassName = globalResultElem.isInUse ? 
                            'pcc-search-filter pcc-filter-term pcc-checked' : 
                            'pcc-search-filter pcc-filter-term',
                        div = resultView.elem('div', { className: divClassName }),
                        count = resultView.elem('span', { className: 'pcc-term-count', text: localCount }),
                        checkbox = resultView.elem('span', { className: 'pcc-checkbox' }),
                        text = document.createTextNode(globalResultElem.prettyName),
                        backgroundColor = PCCViewer.Util.layerColors({ color: localColor, opacity: 100 }, '#ffffff'); 
                    
                    count.style.backgroundColor = backgroundColor;
                  
                    div.appendChild(checkbox);
                    div.appendChild(text);
                    div.appendChild(count);
                    
                    div.setAttribute('data-pcc-filter-term', termName);
                    div.setAttribute('data-pcc-filter-count', globalResultElem.prevCount);
                    
                    var $div = $(div).on('click', function(){
                        $div.toggleClass('pcc-checked');
                        
                        // some GC cleanup magic
                        onFilterDismissFunction = undefined;
                        onFilterDismissFunction = function() {
                            // Execute a new search using only the filtered items
                            executeSearch(true);
                        };
                    });
                    
                    fragment.appendChild(div);
                });
                
                $container.append(fragment);
                
                // Sort the hit filters based on count
                // Highest count will appear toward the top
                sortDOM($container.children(), function(a, b){
                    var aData = $(a).data(),
                        bData = $(b).data();

                    return bData.pccFilterCount - aData.pccFilterCount;
                });
            };

            // Causes a user initiated search to be executed.
            var executeSearch = function (isRerun) {
                // reset advanced search DOM nodes
                $advancedSearchToggle.removeClass('pcc-active');
                $advancedSearchPanel.removeClass('pcc-open');
                
                // blur the search input box
                viewer.viewerNodes.$searchInput.blur();
                
                searchResultsCount = 0;
                // clear results DOM
                viewer.viewerNodes.$searchResults.empty();
                // clear the search from the viewer
                viewer.viewerControl.clearSearch();
                // reset the results throttle variables
                delayCount = 0;
                // delete the previous search request object
                if (searchRequest instanceof PCCViewer.SearchRequest) { 
                    // Setting this explicitly before reassigning will explicitly release the previous
                    // request, and anything it may have in scope, to GC.
                    searchRequest = undefined;
                    searchRequest = {}; 
                }
                // clear the onFilterDismiss function, as it is no longer valid
                onFilterDismissFunction = undefined;
                // clear active search result
                $activeSearchResult = undefined;
                // clear comment highlights
                clearAllCommentResults(searchResults);
                // clear mark highlights
                clearAllMarkResults();
                
                // reset previous search results
                searchResults = [];

                // reset previous set of search results to resort
                searchResultsToResort = [];
                
                // unless this is a filtered search, reset the global search cache
                if (!isRerun) {
                    globalSearchTerms = {};
                }
                
                // get areas to search in from the UI buttons
                var searchIn = _.reduce( $('[data-pcc-search-in].pcc-active'), function(seed, el){
                    var location = el.getAttribute('data-pcc-search-in');
                    seed[location] = true;
                    seed.filterCount += 1;
                    
                    return seed;
                }, { filterCount: 0 });

                // Track within the module, whether or not we are searching the document text.
                searchingInDocument = searchIn.document ? true : false;
                
                if (!advancedSearchIsOn) {
                    // advanced search is disabled, so we should only search in the document
                    searchIn.document = true;
                    searchIn.filterCount = 1;
                }
                
                // check if searching in any content was requested
                if (!searchIn.filterCount) {
                    // execute a search complete and exit this method
                    searchCompletedHandler();
                    return;
                }
                
                var searchQuery = getSearchQuery(!!isRerun),
                    serverValid = viewer.viewerControl.validateSearch(searchQuery),
                    errorMsg = [];
                
                // Save the search query to be used for search area filters
                prevSearchQuery = searchQuery;
                
                // Check to see if all terms were unchecked in the UI
                if (searchQuery.searchTerms.length === 0) {
                    // Open results panel and update state
                    showSearchBar();
                    
                    // Attempt to only show marks.
                    // Do not search in mark text, as there are no text queries
                    searchIn.markText = false;
                    executeMarksSearch(searchQuery, searchIn);
                    
                    // There are no search terms to look for
                    searchCompletedHandler();
                    
                    return;
                }
                
                if (serverValid.errorsExist) {
                    if (typeof serverValid.summaryMsg !== 'undefined') {
                        errorMsg.push(serverValid.summaryMsg);
                    } else {
                        for (var i = 0; i < serverValid.searchTerms.length; i++) {
                            var termObj = serverValid.searchTerms[i];

                            if (!termObj.isValid) {
                                errorMsg.push(termObj.message);
                            }
                        }
                    }

                    viewer.notify({
                        message: _.uniq(errorMsg, true).join(' ')
                    });

                    return;
                }

                updateStatusUi('Searching...', true, 100);

                viewer.viewerNodes.$searchSubmit.addClass('pcc-hide');
                viewer.viewerNodes.$searchCancel.removeClass('pcc-hide');

                resetSearchParams();

                viewer.$dom.find('.pcc-dropdown, .pcc-dialog.pcc-open').removeClass('pcc-open');

                showSearchBar();
                
                // Queue search in document first, since it is asynchronous and takes time
                if (searchIn.document) {
                    searchRequest = viewer.viewerControl.search(searchQuery);

                    searchRequest.on('PartialSearchResultsAvailable', partialSearchResultHandler);
                    searchRequest.on('SearchCompleted', searchCompletedHandler);
                    searchRequest.on('SearchFailed', searchFailedHandler);
                    searchRequest.on('SearchAborted', searchCancelledHandler);
                    searchRequest.on('SearchResultsAvailable', searchResultsAvailableHandler);
                }
                
                // Search marks if requested
                // This is synchronous and relatively fast
                if (searchIn.annotations || searchIn.redactions || searchIn.signatures) {
                    executeMarksSearch(searchQuery, searchIn);
                }
                
                // Search comments if requested
                // This is synchronous and relatively fast
                if (searchIn.comments) {
                    executeCommentsSearch(searchQuery);
                }
                
                // Show the results panel, so user can see results start to come in
                viewer.viewerNodes.$searchResultsContainer.addClass('pcc-show-lg');

                // If not searching in document, then the search is now done at this point
                if (!searchIn.document) {
                    searchCompletedHandler();
                }
            };

            var executeMarksSearch = function(searchQuery, searchIn){
                // augment searchIn object with mark specific options
                searchIn = _.reduce( $('[data-pcc-search-in-marks].pcc-checked'), function(seed, el){
                    var location = el.getAttribute('data-pcc-search-in-marks');
                    seed[location] = true;
                    seed.filterCount += 1;
                    
                    return seed;
                }, searchIn);
                
                if (searchQuery.searchTerms.length === 0) {
                    // do not search in mark text if there are no terms to search
                    searchIn.markText = false;
                }
                
                var allTextMarks = [],
                    allDrawingMarks = [],
                    redactionReasons = [],
                    results = [];
                
                // Filter all marks into local collections based on type and whether the user requested them.
                _.forEach(viewer.viewerControl.getAllMarks(), function(mark){
                    var category = (mark.getType().match(/redaction/i)) ? 'redactions' : 
                                   (mark.getType().match(/signature/i)) ? 'signatures' : 'annotations';
                    
                    if (!searchIn[category]) {
                        // this mark was not requested
                        return;
                    }
                    
                    // filter redactions with reasons at this point, which will be searched separately
                    if (mark.getReason) {
                        redactionReasons.push(mark);
                        return;
                    }

                    if (mark.getText && searchIn.markText && category !== 'signatures') {
                        allTextMarks.push(mark);
                    } else if (searchIn.showAllTypes) {
                        allDrawingMarks.push(mark);
                    }
                });

                // normalize all marks results
                function pushResults(mark, resultArray){
                    results.push.apply(results, _.map(resultArray, function(res){
                        res.source = mark;
                        res.index = viewer.viewerControl.getCharacterIndex(mark);
                        res.getPageNumber = function(){ return mark.getPageNumber(); };
                        res.getBoundingRectangle = function(){ return mark.getBoundingRectangle(); };
                        
                        return res;
                    }));
                }
                
                // Search inside all text-based marks that were added to local collections
                if (allTextMarks.length && searchIn.markText) {
                    var searchTask = new PCCViewer.SearchTask(searchQuery);

                    _.forEach(allTextMarks, function(mark){
                        var res = searchTask.search(mark.getText());
                        pushResults(mark, res);
                    });
                }
                
                // Search through all redactions with reasons added to local collections
                if (redactionReasons.length) {
                    // find all reasons that the user requested to see
                    var reasonsToShow = [];
                    _.chain(searchIn).keys().forEach(function(name){
                        if (name.match('reason:')) {
                            reasonsToShow.push( name.replace('reason:', '') );
                        }
                    });
                    
                    // check if each redaction has a requested reason
                    _.forEach(redactionReasons, function(mark){
                        var thisReason = mark.getReason() || viewer.language.searchFilters.reasonUndefined;
                        if (_.contains(reasonsToShow, thisReason)){
                            pushResults(mark, [{}]);
                        }
                    });
                }
                
                // Display all drawing-based marks added to local collections
                if (allDrawingMarks.length) {
                    _.forEach(allDrawingMarks, function(mark){
                        // It's okay to add an empty object as the result, since the normalizer will add
                        // all of the required data from a plain drawing mark.
                        pushResults(mark, [{}]);
                    });
                }
                
                
                // handle all marks results as partial results
                partialSearchResultHandler({ partialSearchResults: results });

                // highlight the text in mark results
                highlightMatchingTextInMarkResults(results);
            };

            var executeCommentsSearch = function(searchQuery){
                var searchTask = new PCCViewer.SearchTask(searchQuery),
                    results = [];

                function searchComments(comments) {
                    _.each(comments, function(c) {
                        var resultsInComment = searchTask.search(c.getText()),
                            markIndex = viewer.viewerControl.getCharacterIndex(c.getConversation().getMark());

                        if (resultsInComment.length) {

                            _.forEach(resultsInComment, function(result){
                                // augment the properties of the result object
                                result.source = c;
                                result.index = markIndex;
                                result.getPageNumber = function(){ return c.getConversation().getMark().getPageNumber(); };
                                result.getBoundingRectangle = function(){ return c.getConversation().getMark().getBoundingRectangle(); };
                            });

                            results = results.concat( resultsInComment );
                        }
                    });
                }

                var allCoversationsWithComments = _.chain(viewer.viewerControl.getAllMarks()).filter(function(mark){
                    return mark.getConversation().getComments().length;
                }).each(function(mark){
                    searchComments( mark.getConversation().getComments() );
                });

                partialSearchResultHandler({ partialSearchResults: results });
                
                showAllCommentResults(results);
            };

            // When a the 'wild card' button is selected, this function will manage the toggle state of other buttons
            // that are logically affected by the change in this button's toggle state.
            var wildcardClickHandler = function (wildcard) {
                $(wildcard).toggleClass('pcc-active');

                if ($(wildcard).hasClass('pcc-active')) {
                    viewer.viewerNodes.$searchMatchWholeWord.removeClass('pcc-active').addClass('pcc-disabled');
                    viewer.viewerNodes.$searchBeginsWith.removeClass('pcc-active').addClass('pcc-disabled');
                    viewer.viewerNodes.$searchEndsWith.removeClass('pcc-active').addClass('pcc-disabled');
                } else {
                    viewer.viewerNodes.$searchMatchWholeWord.removeClass('pcc-disabled');
                    viewer.viewerNodes.$searchBeginsWith.removeClass('pcc-disabled');
                    viewer.viewerNodes.$searchEndsWith.removeClass('pcc-disabled');
                }

                return true;
            };

            // When a the 'match whole word' button is selected, this function will manage the toggle state of other buttons
            // that are logically affected by the change in this button's toggle state.
            var matchWholeWordClickHandler = function (matchWholeWord) {
                if ($(matchWholeWord).hasClass('pcc-disabled')) {
                    return false;
                }

                $(matchWholeWord).toggleClass('pcc-active');

                return true;
            };

            // When a the 'begins with' button is selected, this function will manage the toggle state of other buttons
            // that are logically affected by the change in this button's toggle state.
            var beginsWithClickHandler = function (beginsWithBtn) {
                if ($(beginsWithBtn).hasClass('pcc-disabled')) {
                    return false;
                }

                $(beginsWithBtn).toggleClass('pcc-active');

                return true;
            };

            // When a the 'end with' button is selected, this function will manage the toggle state of other buttons
            // that are logically affected by the change in this button's toggle state.
            var endsWithClickHandler = function (endWithBtn) {
                if ($(endWithBtn).hasClass('pcc-disabled')) {
                    return false;
                }

                $(endWithBtn).toggleClass('pcc-active');

                return true;
            };

            // When a the 'exact phrase' button is selected, this function will manage the toggle state of other buttons
            // that are logically affected by the change in this button's toggle state.
            var exactPhraseClickHandler = function (exactPhraseBtn) {
                $(exactPhraseBtn).toggleClass('pcc-active');
                return true;
            };

            // When a the 'match case' button is selected, this function will manage the toggle state of other buttons
            // that are logically affected by the change in this button's toggle state.
            var matchCaseClickHandler = function (matchCaseBtn) {
                $(matchCaseBtn).toggleClass('pcc-active');
                return true;
            };

            // Selecting the Next button in the search result list causes the following search result to be selected and
            // displayed.
            var nextResultClickHandler = function (nextResultBtn) {
                if (searchResultsCount === 0 || $(nextResultBtn).attr('disabled')) {
                    return false;
                }

                var results = viewer.viewerNodes.$searchResults;

                if ($activeSearchResult === undefined) {
                    $activeSearchResult = results.children(":first");
                    $activeSearchResult.click();
                } else {
                    $activeSearchResult = $activeSearchResult.next();
                    $activeSearchResult.click();
                    results.scrollTop(results.scrollTop() + $activeSearchResult.position().top - 200);
                }

                updatePrevNextButtons();
            };

            // Selecting the Previous button in the search result list causes the previous search result to be selected and
            // displayed.
            var previousResultClickHandler = function (previousResultBtn) {
                if (searchResultsCount === 0 || $(previousResultBtn).attr('disabled')) {
                    return false;
                }
                
                var results = viewer.viewerNodes.$searchResults;

                if ($activeSearchResult === undefined) {
                    $activeSearchResult = results.children(":last");
                    $activeSearchResult.click();
                } else {
                    $activeSearchResult = $activeSearchResult.prev();
                    $activeSearchResult.click();
                    results.scrollTop(results.scrollTop() + $activeSearchResult.position().top - 200);
                }

                updatePrevNextButtons();
            };

            // This function manages the state of the Previous and Next navigation buttons in the search results list.
            var updatePrevNextButtons = function () {
                var hasNextResult = $activeSearchResult.next().length > 0;
                var hasPrevResult = $activeSearchResult.prev().length > 0;

                if (hasNextResult) {
                    viewer.viewerNodes.$searchNextResult.removeAttr('disabled');
                }
                else {
                    viewer.viewerNodes.$searchNextResult.attr('disabled', 'disabled');
                }

                if (hasPrevResult) {
                    viewer.viewerNodes.$searchPrevResult.removeAttr('disabled');
                }
                else {
                    viewer.viewerNodes.$searchPrevResult.attr('disabled', 'disabled');
                }
            };

            // When the user chooses to clear the current search, this function cleans up the UI and associated data
            // structures.
            var clearSearch = function (ev) {
                var elDialog = viewer.$dom.find('.pcc-dialog-search');

                viewer.viewerNodes.$searchInput.val('');
                // disable the previous and next buttons
                elDialog.find('button[data-pcc-search]').prop('disabled', true);

                searchResultsToResort = [];
                
                viewer.viewerNodes.$searchResults.empty();
                viewer.viewerNodes.$searchResultCount.html(viewer.language.searchResultsNone);
                
                viewer.$dom.find('.pcc-row-results-status').addClass('pcc-hide');

                viewer.$dom.find('[data-pcc-toggle-id=dropdown-search-patterns] input').prop('checked', false);
                
                resetSearchParams();
                // clear the search in viewer control
                viewer.viewerControl.clearSearch();
                // clear comment highlights
                clearAllCommentResults(searchResults);
                // clear mark highlights
                clearAllMarkResults();
                // clear the filter terms list
                viewer.viewerNodes.$searchFilterContainer
                    .find('[data-pcc-section=searchTerms] .pcc-section-content').empty()
                    .append( document.createTextNode(viewer.language.searchFilters.noTerms) );

                setSearchButtons({
                    "matchCase": false,
                    "endsWith": false,
                    "beginsWith": false,
                    "matchWholeWord": false,
                    "exactPhrase": false
                });
            };

            // When user cancels a running search, this function updates the UI and also informs the API of
            // cancellation.
            var cancelSearch = function () {
                viewer.viewerNodes.$searchSubmit.removeClass('pcc-hide');
                viewer.viewerNodes.$searchCancel.addClass('pcc-hide');
                
                searchRequest.cancel();
            };

            var setUIElementsSearch = function(){
                if(advancedSearchIsOn){
                    // show the advanced search elements
                    $searchContainerToggles.removeClass('pcc-hide');
                    $searchContainerToggles.addClass('pcc-show');
                    $advancedSearchColumnHeader.eq(1).removeClass('pcc-col-10');
                    $advancedSearchColumnHeader.eq(1).addClass('pcc-col-8');
                    $advancedSearchColumnHeader.eq(2).removeClass('pcc-hide');
                    $advancedSearchColumnHeader.eq(2).addClass('pcc-show');
                } else {
                    // advanced search is off
                    viewer.viewerNodes.$searchFilterContainer.empty();
                }
            };

            $searchContainerToggles.on('click', function(ev){
                var $this = $(this),
                    which = $this.data('pccSearchContainerToggle'),
                    wasActive = $this.hasClass('pcc-active'),
                    hideAllClass = 'pcc-hide pcc-hide-lg';
                
                if (wasActive) {
                    // turn off this toggle
                    $this.removeClass('pcc-active');
                    
                    viewer.viewerNodes.$searchDialog.removeClass('pcc-expand');
                } else {
                    // turn on this toggle
                    $searchContainerToggles.removeClass('pcc-active');
                    $this.addClass('pcc-active');    
                    
                    viewer.viewerNodes.$searchDialog.addClass('pcc-expand');
                }
                
                // toggle was flipped, so flip the bool
                var isActive = !wasActive;
                
                // Hide the prev/next buttons only when showing filters,
                // as well as hide/show the results panel.
                if (which === 'filter' && isActive) {
                    // Hide buttons on all viewports
                    viewer.viewerNodes.$searchDialog.find('.pcc-search-nav').addClass('pcc-hide');
                    
                    // Show filters panel only
                    viewer.viewerNodes.$searchResultsContainer.addClass(hideAllClass);
                    viewer.viewerNodes.$searchFilterContainer.removeClass(hideAllClass);
                } else {
                    // Show buttons on all viewports
                    viewer.viewerNodes.$searchDialog.find('.pcc-search-nav').removeClass('pcc-hide');
                    
                    // Show results panel only
                    viewer.viewerNodes.$searchResultsContainer.removeClass(hideAllClass);
                    viewer.viewerNodes.$searchFilterContainer.addClass(hideAllClass);
                    
                    // Filters were dismissed, so call the onDismiss function
                    if (onFilterDismissFunction && typeof onFilterDismissFunction === 'function') {
                        onFilterDismissFunction();
                    }
                }
            });

            // Request page text for a page only when text is not loaded in the viewer
            // and only if it has not previosly been requested for this page.
            var pageTextRequested = [];
            var ensurePageTextIsRequested = function(pageNumber) {
                pageTextRequested[pageNumber] = pageTextRequested[pageNumber] ||
                    viewer.viewerControl.isPageTextReady(pageNumber);

                if (pageTextRequested[pageNumber] !== true) {
                    viewer.viewerControl.requestPageText(pageNumber);
                }
            };

            // When page text is ready, re-sort any mark or comment search results that need
            // to be sorted based on position relative to text.
            var resortOnPageTextReady = function(ev) {
                if (searchResultsToResort && searchResultsToResort.length !== 0) {
                    // We can re-sort search results for the page where text is ready
                    var resultsForPage = _.filter(searchResultsToResort, function(result) {
                        return result.searchResult.getPageNumber() === ev.pageNumber;
                    });

                    if (resultsForPage && resultsForPage.length !== 0) {
                        // Remove results that we are re-sorting from the list of results to re-sort
                        searchResultsToResort = _.difference(searchResultsToResort, resultsForPage);

                        _.each(resultsForPage, function (result) {
                            var newSortIndex = -2;
                            if (result.searchResult.source instanceof PCCViewer.Comment) {
                                newSortIndex = viewer.viewerControl.getCharacterIndex(result.searchResult.source.getConversation().getMark());
                            } else {
                                newSortIndex = viewer.viewerControl.getCharacterIndex(result.searchResult.source);
                            }
                            result.domElement.setAttribute('data-pcc-sort-index', newSortIndex);
                        });

                        sortAndColorCorrectResultsView();
                    }
                }
            };

            // Perform any changes that need to occur when text is ready for a page.
            var pageTextReadyHandler = function(ev) {
                resortOnPageTextReady(ev);
            };

            // Initialize the module.
            init();
            
            // Show and hide filter sections when the titles are clicked on
            $searchFilterSections.on('click', '.pcc-section-title', function(){
                var $section = $(this).parent('.pcc-section');
                
                $section.toggleClass('pcc-expand');
            });
            
            $('[data-pcc-search-in]').on('click', function(ev){
                // change the state of this toggle
                $(this).toggleClass('pcc-active');
                
                // some GC cleanup magic
                onFilterDismissFunction = undefined;
                onFilterDismissFunction = function() {
                    // run a new search with the new settings
                    executeSearch(true);
                };
            });
            
            // Rerun search whenever one of the search areas is turned on or off
            $('[data-pcc-search-in-marks]').on('click', function(ev){
                var checkedClass = 'pcc-checked',
                    $this = $(this),
                    which = $this.attr('data-pcc-search-in-marks');
                    
                $this.toggleClass(checkedClass);
                
                // some GC cleanup magic
                onFilterDismissFunction = undefined;
                onFilterDismissFunction = function() {
                    executeSearch(true);
                };
            });

            // The publicly accessible members of this module.
            return {
                initialSearchHandler: initialSearchHandler,
                executeSearch: executeSearch,
                wildcardClickHandler: wildcardClickHandler,
                matchWholeWordClickHandler: matchWholeWordClickHandler,
                beginsWithClickHandler: beginsWithClickHandler,
                endsWithClickHandler: endsWithClickHandler,
                exactPhraseClickHandler: exactPhraseClickHandler,
                matchCaseClickHandler: matchCaseClickHandler,
                nextResultClickHandler: nextResultClickHandler,
                previousResultClickHandler: previousResultClickHandler,
                clearSearch: clearSearch,
                cancelSearch: cancelSearch,
                pageTextReadyHandler: pageTextReadyHandler
            };
        })();

        // The annotationIo module manages the loading and saving of annotations between the
        // viewer and the web tier.
        this.annotationIo = (function () {

            // Contains the current state of annotations in regards to whether they are saved or not to the web tier.
            var annotationDirty = false,

            // The name of the currently loaded annotation record.
                currentlyLoadedAnnotation,

            // The jQuery selector for the dialog window warning of an existing annotation record with the same name.
                $overwriteOverlay,

            // The jQuery selector for the dialog window warning of unsaved annotation changes.
                $unSavedChangesOverlay,

            // The jQuery selector for the generic overlay background.
                $overlayFade,

            // This is a container object that maps annotation record ids (as keys) to annotation record objects (as values)
                markupRecords = {};

            // Initialize the module by attaching UI event handlers and by attaching listeners for events that
            // modify annotations.
            var init = function () {

                annotationModificationListeners();

                viewer.viewerNodes.$annotateSaveDialog.find('input').on("keydown", function (event) {
                    return handleFilenameInput(this, event);
                });

                viewer.viewerNodes.$annotateSaveDialog.find('button').on('click', function () {

                    var fieldVal = viewer.viewerNodes.$annotateSaveDialog.find('input').val();
                    safeSave(fieldVal);
                });

                viewer.viewerNodes.$annotationList.on('click', '.pcc-row', function () {

                    handleLoadSelection(this);

                });

                if (options.autoLoadAnnotation === true &&
                    typeof options.annotationID === 'string') {

                    loadMarkupRecord({name: options.annotationID});
                    viewer.viewerControl.setPageNumber(1);
                }

            };

            // Determines what needs to happen when either the annotation save or load dialogs are displayed.
            var onOpenDialog = function (newIoMode) {

                removeAllOverlays();

                if (newIoMode === 'save' && !saveDialogIsOpen()) {
                    onOpenSaveDialog();
                } else if (newIoMode === 'load' && !loadDialogIsOpen()) {
                    loadMarkupList();

                    if (currentlyLoadedAnnotation) {
                        updateLoadStatusMsg(viewer.language.annotations.load.status + currentlyLoadedAnnotation);
                    } else {
                        updateLoadStatusMsg('');
                    }
                }

                return true;
            };

            // Attaches listeners for events that cause the displayed annotations to differ from the saved annotation
            // record.
            var annotationModificationListeners = function () {

                var i = 0, modifyingEvents = ['MarkCreated', 'MarkRemoved', 'MarkChanged', 'MarkReordered', 'CommentCreated', 'CommentChanged', 'CommentRemoved'],
                    modHandler = function () {
                        annotationDirty = true;

                        if (saveDialogIsOpen()) {
                            updateSaveMsg();
                            enableSaveForm();
                        }
                    };

                for (i; i < modifyingEvents.length; i++) {
                    viewer.viewerControl.on(modifyingEvents[i], modHandler);
                }
            };

            // After the user inputted file name is validated, the API is called with a request to save the
            // displayed annotations.
            var safeSave = function (filename) {

                filename = filename.replace(/^\s+|\s+$/g, '');

                if (filename.length > 30) {
                    viewer.notify({
                        message: viewer.language.annotations.save.filenameMax
                    });

                    return;
                }

                if (!filename.length) {
                    viewer.notify({
                        message: viewer.language.annotations.save.filenameEmpty
                    });

                    return;
                }

                if (filename === currentlyLoadedAnnotation) {
                    save(filename);
                    return;
                }

                updateSaveMsg(viewer.language.annotations.save.waiting); // language to json
                disableSaveForm();

                viewer.viewerControl.getSavedMarkupNames().then(
                    // success:
                    function (markupRecords) {

                        var duplicate = false, i = 0;

                        for (i; i < markupRecords.length; i++) {

                            if (filename === markupRecords[i].name) {
                                duplicate = true;
                                break;
                            }
                        }

                        if (duplicate) {
                            showOverwriteOverlay();
                        } else {
                            save(filename);
                        }
                    },
                    // failure:
                    function (response) {
                        viewer.notify({
                            message: viewer.language.annotations.save.failure
                        });
                    });

            };

            // With no validation of the file name, the API is called with a request to save the
            // displayed annotations.
            var save = function (filename) {

                viewer.viewerControl.saveMarkup(filename).then(onSuccessfulSave, onFailedSave);

                currentlyLoadedAnnotation = filename;

                disableSaveForm();

            };

            // This function is called when an annotation is successfully saved to the web tier. It displays a
            // message to the user and also cleans up the UI and resets the annotationDirty flag.
            var onSuccessfulSave = function (filename) {

                viewer.notify({
                    message: viewer.language.annotations.save.success + filename,
                    type: 'success'
                });

                if (saveDialogIsOpen()) {
                    closeSaveDialog();
                }

                removeAllOverlays();

                annotationDirty = false;

            };

            // If an annotation fails to save to the web tier, this function will display a message to the user with
            // associated details.
            var onFailedSave = function (reason) {
                updateSaveMsg(viewer.language.annotations.save.current);
                enableSaveForm();

                viewer.notify({
                    message: viewer.language.annotations.save.failure + reason
                });
            };

            // This function will display a dialog to the user warning that a annotation record already exists
            // with the same name as the one being saved. The user will be presented with options and will need
            // to select one to proceed.
            var showOverwriteOverlay = function () {

                if (typeof $overwriteOverlay === 'undefined') {

                    viewer.$dom.append(_.template(options.template.overwriteOverlay, viewer.language.annotations.save.overwriteOverlay));

                    $overwriteOverlay = viewer.$dom.find('.pcc-annotation-overwrite-dlg');
                    $overlayFade = viewer.$dom.find('.pcc-overlay-fade');

                    $overwriteOverlay.find('.pcc-overlay-closer').on('click', function () {
                        $overwriteOverlay.close();
                        closeSaveDialog();
                    });

                    $overwriteOverlay.close = function () {
                        $overwriteOverlay.hide();
                        $overlayFade.hide();
                    };

                    $overwriteOverlay.mask = function (msg) {

                        if (typeof msg === 'undefined') {
                            $overwriteOverlay.find('.pcc-overlay-mask').show();
                        } else {
                            $overwriteOverlay.find('.pcc-overlay-mask').html(msg).show();
                        }
                    };

                    $overwriteOverlay.unmask = function (msg) {
                        $overwriteOverlay.find('.pcc-overlay-mask').hide();
                    };

                    $overwriteOverlay.on('click', 'li', function (event) {

                        var action = $(this).attr('data-action');

                        overwriteDialogActionsHandler(action);
                    });

                }

                $overwriteOverlay.show();
                $overlayFade.show();

            };

            // The overwrite overlay is a dialog warning that an annotation record already exists
            // with the same name as the one being saved. Once the user selects an action from the dialog,
            // this function will execute the action.
            var overwriteDialogActionsHandler = function (action) {

                switch (action) {

                    case 'save':
                        $overwriteOverlay.mask();
                        save(viewer.viewerNodes.$annotateSaveDialog.find('input').val());
                        break;

                    case 'saveAs':
                        enableSaveForm();
                        $overwriteOverlay.close();
                        var $field = viewer.viewerNodes.$annotateSaveDialog.find('input');
                        $field[0].selectionStart = 0;
                        $field[0].selectionEnd = $field.val().length;
                        $field.focus();
                        updateSaveMsg(viewer.language.annotations.save.as);
                        break;

                    case 'noSave':
                        closeSaveDialog();
                        break;

                    default:
                        break;

                }

            };

            // This function will display a dialog to the user warning that the changes to the displayed annotations
            // have not been saved and might be lost. The user will be presented with options and will need
            // to select one to proceed.
            var showUnsavedChangesOverlay = function () {

                if (typeof $unSavedChangesOverlay === 'undefined') {

                    viewer.$dom.append(_.template(options.template.unsavedChangesOverlay, viewer.language.annotations.save.unsavedOverlay));

                    $unSavedChangesOverlay = viewer.$dom.find('.pcc-annotation-unsaved-dlg');

                    $overlayFade = viewer.$dom.find('.pcc-overlay-fade');

                    $unSavedChangesOverlay.find('.pcc-overlay-closer').on('click', function () {
                        $unSavedChangesOverlay.close();
                        closeSaveDialog();
                    });

                    $unSavedChangesOverlay.close = function () {
                        $unSavedChangesOverlay.hide();
                        $overlayFade.hide();
                    };

                    $unSavedChangesOverlay.mask = function (msg) {

                        if (typeof msg === 'undefined') {
                            $unSavedChangesOverlay.find('.pcc-overlay-mask').show();
                        } else {
                            $unSavedChangesOverlay.find('.pcc-overlay-mask').html(msg).show();
                        }
                    };

                    $unSavedChangesOverlay.unmask = function (msg) {
                        $unSavedChangesOverlay.find('.pcc-overlay-mask').hide();
                    };

                    $unSavedChangesOverlay.on('click', 'li', function (ev) {

                        var action = $(this).attr('data-action');

                        unsavedChangesActionsHandler(action);
                    });

                }

                $unSavedChangesOverlay.show();

                $overlayFade.show();

            };

            // The unsaved changes overlay is a dialog warning that the changes to the displayed annotations
            // have not been saved and might be lost. Once the user selects an action from the dialog,
            // this function will execute the action.
            var unsavedChangesActionsHandler = function (action) {

                if (typeof currentlyLoadedAnnotation === 'undefined' && action === 'save') {
                    action = 'saveAs';
                }

                switch (action) {

                    case 'save':

                        $unSavedChangesOverlay.mask();
                        save(currentlyLoadedAnnotation);
                        $unSavedChangesOverlay.trigger('saveSelected');

                        break;

                    case 'saveAs':
                        openSaveDialog();
                        $unSavedChangesOverlay.close();
                        var $field = viewer.viewerNodes.$annotateSaveDialog.find('input');
                        $field[0].selectionStart = 0;
                        $field[0].selectionEnd = $field.val().length;
                        $field.focus();
                        updateSaveMsg(viewer.language.annotations.save.as);
                        $unSavedChangesOverlay.trigger('saveAsSelected');
                        break;

                    case 'noSave':
                        $unSavedChangesOverlay.trigger('noSaveSelected');

                        break;

                    default:
                        break;

                }

            };

            // The annotation save dialog's message can be updated using this function.
            var updateSaveMsg = function (msg) {

                if (typeof msg === 'undefined') {
                    if (annotationDirty) {
                        viewer.viewerNodes.$annotateSaveDialog.find('input').val(currentlyLoadedAnnotation);

                        if (currentlyLoadedAnnotation) {
                            msg = viewer.language.annotations.save.current;
                        } else {
                            msg = viewer.language.annotations.save.as;
                        }

                    } else {
                        msg = viewer.language.annotations.save.nomods;
                    }
                }

                viewer.viewerNodes.$annotateSaveDialog.find('.pcc-annotation-save-msg').html(msg).show();
            };

            // A function to determine if the annotation save dialog is open or not.
            var saveDialogIsOpen = function () {
                return viewer.$dom.find('.pcc-icon-save').hasClass('pcc-active');
            };

            // A function that causes the annotation save dialog to open.
            var openSaveDialog = function () {
                if (!saveDialogIsOpen()) {
                    viewer.$dom.find('.pcc-icon-save').first().trigger('click');
                }

                onOpenSaveDialog();
            };

            // Resolve save dialog asynchronously so that any events they depend on are executed first
            var onOpenSaveDialog = function () {
                setTimeout(onOpenSaveDialogAsync, 0);
            };

            // Updates the save dialog when it's first opened.
            var onOpenSaveDialogAsync = function () {
                if (!annotationDirty) {
                    viewer.notify({
                        message: viewer.language.annotations.save.nomods
                    });
                } else {
                    setTimeout(function () {
                        viewer.viewerNodes.$annotateSaveDialog.find('input').focus();
                    }, 100);

                    enableSaveForm();
                }

                updateSaveMsg();
            };

            // A function that causes the annotation save dialog to close.
            var closeSaveDialog = function () {

                viewer.viewerNodes.$annotateSaveDialog.find('input').val('');

                if (saveDialogIsOpen()) {
                    viewer.$dom.find('.pcc-icon-save.pcc-active').first().trigger('click');
                }

                removeAllOverlays();

            };

            // The annotation load dialog's message can be updated using this function.
            var updateLoadMsg = function (msg) {

                viewer.viewerNodes.$annotateLoadDialog.find('.pcc-annotation-load-msg').html(msg).show();
            };

            // The annotation save dialog's status message can be updated using this function.
            var updateLoadStatusMsg = function (msg) {

                viewer.viewerNodes.$annotateLoadDialog.find('.pcc-annotation-load-status-msg').html(msg).show();
            };

            // A function to determine if the annotation load dialog is open or not.
            var loadDialogIsOpen = function () {
                return viewer.$dom.find('.pcc-icon-load').hasClass('pcc-active');
            };

            // Causes all annotation related overlays to be removed.
            var removeAllOverlays = function () {
                if (typeof $overwriteOverlay !== 'undefined' && $overwriteOverlay.is(":visible")) {
                    $overwriteOverlay.unmask();
                    $overwriteOverlay.close();
                }

                if (typeof $unSavedChangesOverlay !== 'undefined' && $unSavedChangesOverlay.is(":visible")) {
                    $unSavedChangesOverlay.unmask();
                    $unSavedChangesOverlay.close();
                }

            };

            // This function disables the annotation save form so the user can't input anything in to it.
            var disableSaveForm = function () {
                viewer.viewerNodes.$annotateSaveDialog.find('input, textarea, button, select').attr('disabled', 'disabled');
            };

            // This function enables the annotation save form so the user can use it.
            var enableSaveForm = function () {
                viewer.viewerNodes.$annotateSaveDialog.find('input, textarea, button, select').removeAttr('disabled');
            };

            // A function that causes the annotation load dialog to close.
            var closeLoadDialog = function () {

                if (loadDialogIsOpen()) {
                    viewer.$dom.find('.pcc-icon-load.pcc-active').first().trigger('click');
                }

            };

            // This function causes the annotation list for loading to be unmasked and user selectable.
            var enableLoadSelect = function () {
                unmaskEl(viewer.viewerNodes.$annotateLoadDropdown);
            };

            // This function causes the annotation list for loading to be masked and unselectable.
            var disableLoadSelect = function (msg) {

                unmaskEl(viewer.viewerNodes.$annotateLoadDropdown);

                if (typeof msg === 'undefined') {
                    msg = viewer.language.annotations.load.waiting;
                }

                maskEl(viewer.viewerNodes.$annotateLoadDropdown, msg);
            };

            // Causes an HTML element to be covered with a mask thus disabling it's functionality for the user.
            var maskEl = function (el, msg) {
                var $parent = $(el).parent();
                var mask = document.createElement('div');
                mask.innerHTML = msg || '';
                mask.className = 'pcc-overlay-mask';
                $parent.append(mask);
                $(mask).show();
            };

            // Causes an HTML element to have it's mask removed thus re-enabling it's functionality for the user.
            var unmaskEl = function (el) {
                var $parent = $(el).parent();
                $parent.find('.pcc-overlay-mask').remove();
            };

            // This function validates user input to the annotation save file name field.
            var handleFilenameInput = function (field, event) {
                var keycode = (event.keyCode ? event.keyCode : event.which),
                    retval = true;

                if (event.shiftKey === true && ( keycode === 189 || keycode === 188 || keycode === 190)) {
                    // don't allow _, <, >
                    retval = false;
                } else if (keycode === 13 || keycode === 9) {

                    viewer.viewerNodes.$annotateSaveDialog.find('button').focus().trigger('click');

                } else {
                    var regex = /[\-a-zA-Z0-9 ]+$/;

                    var input = String.fromCharCode(!event.charCode ? event.which : event.charCode);
                    var numbersOnly = /[0-9]+$/;

                    if (numbersOnly.test(input) && event.shiftKey) {
                        return false;
                    }
                    else if (regex.test(input) || event.keyCode === 8 || event.keyCode === 46 || event.keyCode === 39 || event.keyCode === 37 || (event.which >= 96 && event.which <= 105) || event.keyCode === 173 || event.keyCode === 188 || event.keyCode === 189 || event.keyCode === 109) {
                        return true;
                    }
                    else {
                        return false;
                    }
                }

                return retval;
            };

            // This function executes an API request to fetch the list of annotation records associated with the
            // loaded document.
            var loadMarkupList = function () {

                updateLoadMsg(viewer.language.annotations.load.waiting);
                disableLoadSelect('');

                viewer.viewerNodes.$annotationList.empty();

                viewer.viewerControl.getSavedMarkupNames().then(
                    // success:
                    function (markups) {

                        var markupRecordTpl, markupRecord, record, domStrings = [], i = 0;

                        markupRecordTpl = '<div class="pcc-row" data-pcc-markup-record-id="{{ID}}">{{NAME}}</div>';

                        for (i; i < markups.length; i++) {

                            record = markups[i];

                            markupRecords[record.name] = record;

                            markupRecord = markupRecordTpl.replace('{{ID}}', record.name)
                                .replace('{{NAME}}', record.name);

                            domStrings.push(markupRecord);
                        }

                        if (domStrings.length) {
                            viewer.viewerNodes.$annotationList.append(domStrings.join('\n'))
                                .find('.pcc-row:odd').addClass('pcc-odd');

                            updateLoadMsg(viewer.language.annotations.load.instructions);
                            enableLoadSelect();

                        } else {

                            viewer.notify({
                                message: viewer.language.annotations.load.emptyList
                            });

                            updateLoadMsg(viewer.language.annotations.load.emptyList);
                            disableLoadSelect('');

                        }

                    },
                    // failure:
                    function (response) {
                        closeLoadDialog();
                        viewer.notify({
                            message: viewer.language.annotations.load.listFailure
                        });
                    });
            };

            // This function executes an API request to load a specific annotation record.
            var loadMarkupRecord = function (record) {

                updateLoadMsg(viewer.language.annotations.load.waiting);
                disableLoadSelect('');

                viewer.viewerControl.loadMarkup(record.name).then(
                    // success:
                    function (markupRecord) {
                        closeLoadDialog();
                        viewer.setMouseTool({ mouseToolName: 'AccusoftPanAndEdit' });
                        currentlyLoadedAnnotation = markupRecord;
                        annotationDirty = false;
                        if (typeof viewer.activeFitType !== 'undefined') { viewer.viewerControl.fitContent(viewer.activeFitType); }
                    },
                    // failure:
                    function (markupRecord) {
                        closeLoadDialog();
                        viewer.notify({
                            message: viewer.language.annotations.load.recordFailure
                        });
                    }
                );
            };

            // This function listens for user selection of an annotation record from a displayed list. It then attempts
            // to load that record.
            var handleLoadSelection = function (resultRow) {

                var record = markupRecords[resultRow.getAttribute('data-pcc-markup-record-id')];

                if (annotationDirty) {

                    showUnsavedChangesOverlay();

                    $unSavedChangesOverlay.one('noSaveSelected', function () {
                        loadMarkupRecord(record);
                    });

                    if (currentlyLoadedAnnotation) {
                        $unSavedChangesOverlay.one('saveSelected', function () {
                            closeLoadDialog();
                        });
                    }

                    return false;
                }

                loadMarkupRecord(record);

            };

            // The publicly accessible members of this module.
            return {
                init: init,
                onOpenDialog: onOpenDialog
            };

        })();

        // create the eSignature UI module
        this.eSignature = (function () {

            var  placeSignatureTool = PCCViewer.MouseTools.getMouseTool('AccusoftPlaceSignature');

            var $esignOverlay;
            var $esignPlace;

            var init = function () {
                $esignOverlay = viewer.viewerNodes.$esignOverlay;
                $esignPlace = viewer.viewerNodes.$esignPlace;

                // Find if we know which signature was used last
                _.forEach(PCCViewer.Signatures.toArray(), function(el) {
                    // Check if this signature was left selected during a previous session.
                    if (el.lastSelected) {
                        changeMouseToolSignature(el, true);
                        // Use `true` so that the mouse tool is not switched on.
                    }
                });

                attachListeners();
                updateSignatureButtons();
            };

            var destroy = function () {
                PCCViewer.Signatures.off('ItemAdded', signatureAdded);
                PCCViewer.Signatures.off('ItemRemoved', signatureRemoved);
            };

            var attachListeners = function () {
                PCCViewer.Signatures.on('ItemAdded', signatureAdded);
                PCCViewer.Signatures.on('ItemRemoved', signatureRemoved);

                $esignOverlay.on('click','.pcc-icon-delete', function(ev) {
                    localSignatureManager.clearAll();
                });
            };

            var updateSignatureButtons = function () {
                if (PCCViewer.Signatures.toArray().length > 0) {
                    $esignPlace.removeClass('pcc-disabled');
                    $esignPlace.removeAttr('disabled');
                } else {
                    $esignPlace.addClass('pcc-disabled');
                    $esignPlace.attr('disabled', '');
                }
            };

            // a signature was added to the PCCViewer.Signatures collection
            var signatureAdded = function (ev) {
                if (typeof ev.item === 'undefined') {
                    viewer.notify({message: options.language.noSignatures});
                    return;
                }

                // Enable the buttons if they were disabled
                updateSignatureButtons();
            };

            // a signature was removed from the PCCViewer.Signatures collection
            var signatureRemoved = function (ev) {
                var signatureArr = PCCViewer.Signatures.toArray();

                // unassociate the removed signature from the mouse tool if needed
                var accusoftPlaceSignature = PCCViewer.MouseTools.getMouseTool("AccusoftPlaceSignature");
                if (ev.item === accusoftPlaceSignature.getTemplateMark().getSignature()) {
                    accusoftPlaceSignature.getTemplateMark().setSignature(undefined);
                }

                // Disable the place button if there are no signatures
                updateSignatureButtons();
            };

            // This is used to keep track of the resized signature on the document.
            // We will use this size to insert the same signature with the same size next time.
            function updateSignatureSizeOnDocument(mark) {
                var signatureObj, compareIterator, sizeChanged = false;

                // Find the mark type and get references to the comparable properties
                switch (mark.getType()) {
                    case PCCViewer.Mark.Type.FreehandSignature:
                        compareIterator = function(sig){
                            return sig.path === mark.getPath();
                        };
                        break;
                    case PCCViewer.Mark.Type.TextSignature:
                        compareIterator = function(sig){
                            return sig.text === mark.getText() && sig.fontName === mark.getFontName();
                        };
                        break;
                }

                // Find the correct signature
                PCCViewer.Signatures.forEach(function(el){
                    if (compareIterator(el)) {
                        signatureObj = el;
                    }
                });

                if (signatureObj) {
                    // Save the width and height of the rectangle.
                    var rectangle = mark.getRectangle();

                    // Check if the size has changed and only update if necessary
                    if (signatureObj.documentHeight !== rectangle.width) {
                        signatureObj.documentWidth = rectangle.width;
                        sizeChanged = true;
                    }
                    if (signatureObj.documentHeight !== rectangle.height) {
                        signatureObj.documentHeight = rectangle.height;
                        sizeChanged = true;
                    }

                    // Save the signatures for use after psge refresh
                    // Let's avoid local storage if we don't have to
                    if (sizeChanged) {
                        localSignatureManager.setStored(PCCViewer.Signatures.toArray());
                    }
                }
            }

            function changeLastSelectedSignature(signature) {
                PCCViewer.Signatures.forEach(function(el){
                    el.lastSelected = (el === signature);
                });
            }

            function changeMouseToolRectangle(signature) {
                var templateMark = placeSignatureTool.getTemplateMark();

                templateMark.setRectangle({
                    x: 0, y: 0,
                    width: signature.documentWidth || 0,
                    height: signature.documentHeight || 0
                });
            }

            function changeMouseToolSignature(signature, skipMouseToolChange, apiTrigger) {
                var templateMark = placeSignatureTool.getTemplateMark();

                // Default to the first signature if one is not passed in
                // Just in case, check that a `path` or `text` is defined
                if (!signature || !(signature.path || signature.text)) {
                    signature = PCCViewer.Signatures.toArray().shift();
                }

                // Set the signature as the default to use with the PlaceSignature mouse tool
                templateMark.setSignature(signature);

                // Set the default size of this signature
                changeMouseToolRectangle(signature);

                // Mark this signature as the one currently selected
                changeLastSelectedSignature(signature);
                
                if (!skipMouseToolChange) {
                    viewer.setMouseTool({ 
                        mouseToolName: 'AccusoftPlaceSignature', 
                        // API triggers will not change the locked/unlocked state of a mouse tool.
                        apiTrigger: !!apiTrigger
                    });
                }
            }

            // Updates the context menu if the PlaceSignature mouse tool is in use,
            // since the menu will already be open. If the menu is not open, a change from this
            // module is not necessary, as it will be initialized correctly when the
            // MouseToolChanged event fires.
            function contextMenuUpdater(signature){
                if (signature && viewer.viewerControl.getCurrentMouseTool() === placeSignatureTool.getName()){
                    // the context menu needs to be updated only if the mouse tool was already selected
                    updateContextMenu({
                        showContextMenu: true,
                        showAllEditControls: false,
                        mouseToolType: placeSignatureTool.getType()
                    });
                } else if (signature === undefined) {
                    // the context menu needs to be updated only if the mouse tool was already selected
                    updateContextMenu({
                        showContextMenu: false,
                        showAllEditControls: false,
                        mouseToolType: placeSignatureTool.getType()
                    });
                }
            }

            // generate a signature view for the manager utility
            // also generates generic view to use elsewhere
            function insertSignatureView (signature, domElem, clickHandler, includeButtons) {
                // create dom elements
                var wrapper = document.createElement('div'),
                    container = document.createElement('div'),
                    preview = document.createElement('div'),
                    buttons = document.createElement('div'),
                    name = document.createElement('span'),
                    deleteButton = document.createElement('button'),
                    downloadButton = document.createElement('button'),
                    useButton = document.createElement('button'),
                    useButtonIcon = document.createElement('span'),
                    useButtonText = document.createTextNode(options.language.esignUseSignature || 'Use signature'),
                    showButtons = (includeButtons === false) ? false : true;

                // add class names
                wrapper.className = 'pcc-esign-display';
                container.className = 'pcc-esign-preview-container' + ((signature.lastSelected) ? ' pcc-esign-active' : '');
                preview.className = 'pcc-esign-preview';
                deleteButton.className = 'pcc-icon pcc-icon-delete';
                deleteButton.title = options.language.esignDelete || '';
                downloadButton.className = 'pcc-icon pcc-icon-download';
                downloadButton.title = options.language.esignDownload || '';

                useButtonIcon.className = 'pcc-icon pcc-icon-place';
                useButton.appendChild(useButtonIcon);
                useButton.appendChild(useButtonText);

                buttons.className = 'pcc-margin-top';

                // make sure SVG does not zoom in (only zoom out)
                if (signature.width && signature.height) {
                    preview.style['max-width'] = signature.width + 'px';
                    preview.style['max-height'] = signature.height + 'px';
                }
                // create custom delete button
                deleteButton.onclick = function(){
                    // remove signature from collection
                    PCCViewer.Signatures.remove(signature);

                    // the currently selected signature was deleted
                    if (signature.lastSelected) {
                        // default to the first available signature in the collection
                        var newSignature = PCCViewer.Signatures.toArray().shift();

                        // If there's a new signature, update the UI to use it
                        if (newSignature) {
                            newSignature.lastSelected = true;
                            placeSignatureTool.getTemplateMark().setSignature(newSignature);

                            // re-init the Manager UI
                            viewer.launchESignManage();

                            // update the context menu if necessary
                            contextMenuUpdater(newSignature);
                        } else if (viewer.viewerControl.getCurrentMouseTool() === placeSignatureTool.getName()) {
                            // There are no signatures in the collection.
                            // If the PlaceSignature tool is selected, switch away from the it
                            viewer.setMouseTool({ mouseToolName: 'AccusoftPanAndEdit' });
                        }
                    }

                    // Remove UI elements as well
                    if (wrapper.parentElement) {
                        wrapper.parentElement.removeChild(wrapper);
                    }

                    // If there are no signatures left, re-initialize the Manager UI
                    // in order to display the 'no signatures' message.
                    if (PCCViewer.Signatures.toArray().length === 0){
                        viewer.launchESignManage();
                    }
                };

                // create custom download button
                downloadButton.onclick = function(){
                    // trigger a JSON file download
                    // let's also pretty-print the string
                    PCCViewer.Util.save('signature.json', JSON.stringify(signature, undefined, 2));
                };

                // create custom place signature button
                $(useButton).on('click', function(ev){
                    changeMouseToolSignature(signature, false, true);
                    viewer.closeEsignModal();

                    // update the context menu if necessary
                    contextMenuUpdater(signature);
                });

                // create custom default signature setting logic
                container.onclick = (typeof clickHandler === 'function') ? clickHandler : function(){
                    $esignOverlay.find('.pcc-esign-preview-container').removeClass('pcc-esign-active');
                    $(this).addClass('pcc-esign-active');

                    // assign the signature to the mouse tool
                    changeMouseToolSignature(signature, true);

                    // update the context menu if necessary
                    contextMenuUpdater(signature);
                };

                // insert signature name if one was available
                if (signature.category) {
                    // let's escape unsafe characters
                    var textNode = document.createTextNode(signature.category);
                    name.appendChild(textNode);
                    name.className = 'pcc-pull-right pcc-icon-height';
                }

                // populate the DOM if the signature is rendered successfully
                function placeSuccessfulSignature() {
                    // add everything to the DOM
                    buttons.appendChild(name);
                    buttons.appendChild(deleteButton);
                    buttons.appendChild(downloadButton);
                    buttons.appendChild(useButton);

                    container.appendChild(preview);
                    wrapper.appendChild(container);

                    if (showButtons) {
                        wrapper.appendChild(buttons);
                    }

                    domElem.appendChild(wrapper);
                }

                // populate the DOM if the signature data is unknown or invalid
                function placeCorruptSignature() {
                    // construct error DOM
                    var errorTextNode = document.createTextNode(options.language.esignCorruptData);
                    container.className = container.className + ' pccError pcc-text-center';

                    // build partial DOM
                    buttons.appendChild(deleteButton);
                    container.appendChild(errorTextNode);
                    wrapper.appendChild(container);
                    wrapper.appendChild(buttons);

                    domElem.appendChild(wrapper);
                }

                // generate signature SVG
                try {
                    // this will include signature object validation
                    PCCViewer.SignatureDisplay(preview, signature);
                    // if successfull, we can display the signature
                    placeSuccessfulSignature();
                } catch (err) {
                    // any error probably means the signature object is incorrect
                    placeCorruptSignature();
                }
            }

            // puts dom elements into columns
            function placeIntoColumns (parentElement, childrenArray) {
                var Column = function(){
                    var col = document.createElement('div');
                    // makes 2 columns
                    col.className = 'pcc-col-6';
                    return col;
                };

                var columns = [ Column(), Column() ];
                var columnsClone = [].concat(columns);

                _.forEach(childrenArray, function(child){
                    // take first column
                    var col = columnsClone.shift();
                    // place child inside it
                    col.appendChild(child);
                    // put back in as last column
                    columnsClone.push(col);
                });

                _.forEach(columns, function(col){
                    parentElement.appendChild(col);
                });
            }

            // create a new SignatureControl drawing context
            function getFreehandContext (domElem) {
                return PCCViewer.SignatureControl(domElem);
            }

            // create a custom text signature context
            function getTextContext ($previews, $textInput) {
                var fonts = fontLoader.names(),
                    previewsArray = [],
                    selectedFont = 'Times New Roman';
                // set default selected font
                if (fonts.length > 0) {
                    selectedFont = fonts[0];
                }

                function generatePreview(fontName, text){
                    var div = document.createElement('div');

                    div.className = 'pcc-button pcc-esign-text-preview';
                    // Note: IE8 requires that the font have a fallback
                    div.style.fontFamily = '"' + fontName + '", cursive';
                    div.setAttribute('data-pcc-font-name', fontName);

                    // make sure to escape all text
                    var textNode = document.createTextNode(text);
                    div.appendChild(textNode);

                    return div;
                }

                $previews = $previews || viewer.viewerNodes.$esignOverlay.find('[data-pcc-signature-previews]');

                $textInput = $textInput || (function() {
                    var $ti = viewer.viewerNodes.$esignOverlay.find('[data-pcc-esign="textInput"]'),
                        // find the correct event name based on the browser
                        eventName = ('oninput' in $ti.get(0)) ? 'input' : 'propertychange';

                    $ti.on(eventName, function(ev) {
                        if (ev.originalEvent.propertyName && ev.originalEvent.propertyName !== 'value') {
                            // if this is an old IE propertyChange event for anything other than 'value', ignore it
                            return;
                        }

                        // reset the html
                        $previews.html('');

                        var value = $ti.val();

                        previewsArray = _.map(fonts, function(fontName){
                            return generatePreview(fontName, value);
                        });

                        placeIntoColumns($previews.get(0), previewsArray);
                    });

                    return $ti;
                })();

                $previews.on('click', '.pcc-esign-text-preview', function(ev){
                    _.forEach(previewsArray, function(el){
                        $(el).removeClass('pcc-esign-text-active');
                    });
                    $(this).addClass('pcc-esign-text-active');
                    selectedFont = this.getAttribute('data-pcc-font-name');
                });

                // return an object similar to PCCViewer.SignatureControl
                return {
                    done: function(){
                        return {
                            type: 'text',
                            text: $textInput.val(),
                            fontName: selectedFont
                        };
                    },
                    clear: function(){
                        $textInput.val('');
                        $previews.html('');
                        $textInput.focus();
                    }
                };
            }

            function getManageContext (domElem) {
                // create non-blocking queue
                var queue = new Queue();

                // Populate DOM with known signatures.
                PCCViewer.Signatures.forEach(function(el) {
                    // Let's place each signature rendering in its own iteration of the event loop
                    // so that the UI is not blocked for too long in older browsers and mobile.
                    queue.push(function(){
                        insertSignatureView(el, domElem);
                    });
                });

                // execute the queue
                queue.run();
            }

            return {
                init: init,
                destroy: destroy,
                mouseTool: placeSignatureTool,
                getFreehandContext: getFreehandContext,
                getTextContext: getTextContext,
                getManageContext: getManageContext,
                insertSignatureView: insertSignatureView,
                changeMouseToolSignature: changeMouseToolSignature,
                changeMouseToolRectangle: changeMouseToolRectangle,
                updateSignatureSizeOnDocument: updateSignatureSizeOnDocument
            };
        })();

        // This module manages the hyperlink proximity menu and UI
        var hyperlinkMenu = (function(){
            var control,
                language,
                template,
                globalDom,
                globalDismiss,
                // get a new proximityDismiss object to use for this menu
                proximityDismiss = ProximityDismiss(viewer.$dom);
            
            function createDOM(opts) {
                var div = document.createElement('div');
                div.className = 'pcc-hyperlink-menu';
                
                $(div).html(_.template(template, {
                    mode: opts.mode,
                    link: opts.href,
                    language: language
                }));
                
                return div;
            }
            
            function bindDOM(opts) {
                var useScrollDismiss = true,
                    usingTouch = false,
                    inputIsFocused = false;
                
                var $input = $(opts.dom).find('input').val(opts.href).on('input propertychange', function(ev){
                    // check if it is a propertychange event, and check the property
                    var event = ev.originalEvent ? ev.originalEvent : ev;
                    
                    if (event.type === 'propertychange' && event.propertyName !== 'value'){
                        // this is a legacy IE event not related to the input value
                        return;
                    }
                    
                    if (ev.target.value && ev.target.value.length) {
                        $done.removeAttr('disabled');
                    } else {
                        $done.attr('disabled', 'disabled');
                    }
                }).on('keypress', function(ev){
                    // submit the value with the enter key
                    if (ev.which === 13) {
                        dismissHandler();
                    }
                }).on('touchstart click', function(ev){
                    // keep any click or touch in the input field from bubbling up and causing other events
                    ev.preventDefault();
                    
                    if (ev.type === 'touchstart') {
                        usingTouch = true;
                        
                        // We know that the user is using touch, and they have tapped on the input box to focus it.
                        // We can be pretty sure that the toch keyboard is about to open, causing scroll events to occus,
                        // especially on iOS. We need to ignore these scroll events in terms of dismissing the menu, so that
                        // users can type in their link.
                        useScrollDismiss = false;
                    }

                    return false;
                }).on('focus', function(){
                    inputIsFocused = true;
                    
                    // As long as the user is using touch, and the input is in focus, we should not dismiss for scroll events.
                    // The user is more likely to be dismissing the touch keyboard or trying to move the input box into a 
                    // visible location.
                    useScrollDismiss = usingTouch ? false : useScrollDismiss;
                }).on('blur', function(){
                    inputIsFocused = false;
                    
                    // The input has lost focus, so it is safe to dismiss on scroll now.
                    useScrollDismiss = true;
                });
                
                var dismissed = false;
                function dismiss(){
                    // make sure the menu is dismissed only once
                    if (dismissed) { 
                        return;
                    } else {
                        dismissed = true;
                    }

                    if (opts.mode === 'edit' && $input.val()) {
                        // there is a value, so save it
                        setHref(opts.mark, $input.val());
                    } else if (!opts.mark.getHref() && control.getMarkById(opts.mark.getId())) {
                        // this is a cancel and there was no previous value
                        control.deleteMarks([opts.mark]);
                    }
                    
                    clearDOM();
                    $(document.body).off('click', dismissHandler);
                    proximityDismiss.remove();
                    
                    // if the mark is already selected, use mark selection to refresh the context menu
                    if (opts.mode === 'edit' && _.contains(control.getSelectedMarks(), opts.mark)){
                        control.deselectMarks([opts.mark]);
                        control.selectMarks([opts.mark]);
                    }
                }
                
                var $done = $(opts.dom).find('[data-pcc-hyperlink="done"]').click(function(){
                    setHref(opts.mark, $input.val());
                    dismiss();
                });
                
                var $delete = $(opts.dom).find('[data-pcc-hyperlink="delete"]').click(function(){
                    control.deleteMarks([opts.mark]);
                    dismiss();
                });

                var $clear = $(opts.dom).find('[data-pcc-hyperlink="clear"]').click(function(){
                    $input.val('').focus();
                    $done.attr('disabled', 'disabled');
                });
                
                var $link = $(opts.dom).find('[data-pcc-link-navigate]').on('click', function(){
                    dismiss();
                });
                
                var $edit = $(opts.dom).find('[data-pcc-hyperlink="edit"]').click(function(){
                    // create a new menu in edit mode
                    dismiss();
                    createMenu(opts.mark, 'edit', opts.clientX, opts.clientY);
                });
                
                function dismissHandler(ev){
                    ev = ev || {};
                    
                    if (ev.target && $.contains(opts.dom, ev.target)){
                        // this is a click inside the hyperlink menu, so we will not dismiss
                        // add another handler for the next click
                        return;
                    }
                    
                    if (!useScrollDismiss && ev.type === "scroll") {
                        // do not dismiss if this scroll is due to the touch keyboard opening
                        return;
                    }
                    
                    dismiss();
                }
                
                setTimeout(function(){
                    // delay subscription, since triggering a menu as a result of a click will also trigger this event
                    $(document.body).on('click', dismissHandler);
                    // do not dismiss the menu if the user moves away when in edit mode
                    opts.useMoveTrigger = opts.mode !== 'edit';
                    proximityDismiss.add(opts, dismissHandler);

                    // delay so that focus occurs after the menu is displayed
                    $input.focus();
                    
                    // if there is no content, disable the done button
                    if (!$input.val()) {
                        $done.attr('disabled', 'disabled');
                    }
                }, 0);
                
                return dismiss;
            }
            
            function clearDOM() {
                if (globalDismiss && typeof globalDismiss === 'function') {
                    globalDismiss();
                    globalDismiss = undefined;
                }
                
                if (globalDom && $.contains(document.body, globalDom)){
                    globalDom.parentElement.removeChild(globalDom);
                    globalDom = undefined;
                }
            }
            
            function positionDOM(opts) {
                var clientYscroll = opts.clientY + (window.scrollY || document.body.scrollTop || document.documentElement.scrollTop || 0),
                    clientXscroll = opts.clientX + (window.scrollX || document.body.scrollLeft || document.documentElement.scrollLeft || 0),
                    domBB = opts.dom.getBoundingClientRect(),
                    width = domBB.width || domBB.right - domBB.left,
                    height = domBB.height || domBB.bottom - domBB.top,
                    offset = 10,
                    windowHeight = $(window).height(),
                    windowWidth = $(window).width(),
                    top = Math.min(clientYscroll + offset, (windowHeight - height - offset)),
                    left = Math.min(clientXscroll + offset, (windowWidth - width - offset)),
                    style = { top: top + 'px', left: left + 'px'};
                
                if (!!opts.href) {
                    // center every menu except the creation one
                    left = Math.max(offset, clientXscroll - (width / 2));
                    style.left = left + 'px';
                }
                
                if (top + height + offset > windowHeight) {
                    // menu will display past the bottom edge
                    style.bottom = (windowHeight - clientYscroll - offset) + 'px';
                    style.top = 'auto';
                }

                if (left + width + offset > windowWidth) {
                    // menu will display past the right edge
                    style.right = offset + 'px';
                    style.left = 'auto';
                }

                var styleString = _.map(style, function(val, name){ return name + ':' + val; }).join(';');
                opts.dom.setAttribute('style',  styleString);
            }
            
            function createMenu(mark, mode, clientX, clientY) {
                var opts = {
                    mark: mark,
                    mode: mode,
                    href: mark.getHref(),
                    clientX: clientX,
                    clientY: clientY
                },
                    dom = createDOM(opts);
                
                opts.dom = dom;
                
                globalDismiss = bindDOM(opts);
                document.body.appendChild(dom);
                positionDOM(opts);
                globalDom = dom;
            }
            
            function hyperlinkMenuHandler(ev, mode) {
                clearDOM();
                
                if (ev.clientX && ev.clientY) {
                    createMenu(ev.mark, mode, ev.clientX, ev.clientY);
                }
            }
            
            function setHref(mark, linkText){
                // if no protocol is specified, add the default "http://"
                if (!linkText.match(/^([a-zA-Z]+\:)?\/\//)){
                    linkText = 'http://' + linkText;
                }
                
                mark.setHref(linkText);
            }
            
            function markCreatedHandler(ev){
                if (ev.mark.getType() === PCCViewer.Mark.Type.TextHyperlinkAnnotation && ev.clientX && ev.clientY) {
                    hyperlinkMenuHandler(ev, "edit");
                }
            }

            function init(viewerControl, languageOptions, hyperlinkMenuTemplate, getCurrentMouseToolType){
                control = viewerControl;
                language = languageOptions;
                template = hyperlinkMenuTemplate.replace(/>[\s]{1,}</g, '><');
                
                control.on('Click', function(ev){
                    if (ev.targetType !== "mark" || ((ev.mark && ev.mark.getType && ev.mark.getType() === PCCViewer.Mark.Type.TextHyperlinkAnnotation) === false)) {
                        // Return if a hyperlink mark was not selected.
                        return;
                    }

                    var mouseToolType = getCurrentMouseToolType();
                    if (mouseToolType !== "PanAndEdit" && mouseToolType !== "EditMarks") {
                        // user is using a non-edit tool, so we should ignore the click
                        return;
                    }

                    var selectedMarks = control.getSelectedMarks();
                    if (selectedMarks.length !== 1 || selectedMarks[0] !== ev.mark) {
                        // Return if the user did not click to select a single hyperlink.
                        return;
                    }

                    if (ev.clientX && ev.clientY) {
                        // trigger the menu when clicking on a hyperlink mark with x and y coordinates
                        hyperlinkMenuHandler(ev, "view");
                    }
                });
                
                control.on(PCCViewer.EventType.MarkCreated, markCreatedHandler);
            }
            
            return {
                init: init,
                setHref: setHref,
                triggerMenu: markCreatedHandler
            };
        })();
        
        // This module manages the menu that appears when a user creates an annotation.
        var immediateActionMenu = (function(){
            // All of the available immediate actions
            // Each object includes the following properties:
            // - name {string} : The name shown in the menu.
            // - action {function} : The function to execute when selected from the menu.
            // - valid {function} : Whether the action is valid for this type of mark or event
            //     and should be displayed in the menu. Returns a boolean.
            var actions = [{
                name: "Add Comment",
                languageKey: "addComment",
                action: function(ev, mark) {
                    commentUIManager.addComment(mark.getConversation());
                },
                valid: function(event, type) {
                    // add this for annotations and redactions only
                    return type && !!type.match(/(annotation|redaction)/i);
                }
            },{
                name: "Select",
                languageKey: "select",
                action: function(ev, mark){
                    // deselect all marks
                    control.deselectAllMarks();
                    // select only this one
                    control.selectMarks([mark]);
                },
                valid: function(event, type){
                    // add this for annotations and redactions only
                    return type && !!type.match(/(annotation|redaction)/i);
                }
            },{
                name: "Highlight",
                languageKey: "highlight",
                action: function(ev){
                    // Create a highlight mark from the textSelection in the event
                    var mark = control.addMark(ev.textSelection.pageNumber, PCCViewer.Mark.Type.HighlightAnnotation);
                    mark.setPosition(ev.textSelection);

                    // Clear the text selection
                    control.clearMouseSelectedText(ev.textSelection);
                    
                    // Open a new menu as if a "MarkChanged" fired
                    replaceMenu({
                        mark: mark,
                        clientX: ev.clientX,
                        clientY: ev.clientY,
                        getType: function(){ return "MarkCreated"; }
                    });
                    
                    return false;
                },
                valid: function(event, type){
                    // add this for text selection only
                    return event.toLowerCase() === PCCViewer.EventType.TextSelected.toLowerCase();
                }
            },{
                name: "Redact",
                languageKey: "redact",
                action: function(ev){
                    // Create a highlight mark from the textSelection in the event
                    var mark = control.addMark(ev.textSelection.pageNumber, PCCViewer.Mark.Type.TextSelectionRedaction);
                    mark.setPosition(ev.textSelection);

                    // Clear the text selection
                    control.clearMouseSelectedText(ev.textSelection);
                    
                    // Open a new menu as if a "MarkChanged" fired
                    replaceMenu({
                        mark: mark,
                        clientX: ev.clientX,
                        clientY: ev.clientY,
                        getType: function(){ return "MarkCreated"; }
                    });
                    
                    return false;
                },
                valid: function(event, type){
                    // add this for text selection only
                    return event.toLowerCase() === PCCViewer.EventType.TextSelected.toLowerCase();
                }
            },{
                name: "Hyperlink",
                languageKey: "hyperlink",
                action: function(ev){
                    var mark = control.addMark(ev.textSelection.pageNumber, PCCViewer.Mark.Type.TextHyperlinkAnnotation);
                    mark.setPosition(ev.textSelection);
                    
                    // Clear the text selection
                    control.clearMouseSelectedText(ev.textSelection);
                    
                    // Open the menu to add the hyperlink text
                    hyperlinkMenu.triggerMenu({
                        mark: mark,
                        clientX: ev.clientX,
                        clientY: ev.clientY
                    });
                },
                valid: function(event, type){
                    // add this for text selection only
                    return event.toLowerCase() === PCCViewer.EventType.TextSelected.toLowerCase();
                }
            },{
                name: "Cancel",
                languageKey: "cancelButton",
                action: function(){
                    // no need to do anything here
                },
                valid: function(event, type){
                    // add this for all types
                    return true;
                }
            }];

            var menuClass = 'pcc-immediate-action-menu',
                itemClass = 'pcc-immediate-action-menu-item',
                hoverTriggerClass = 'pcc-hover-trigger',
                dom, // only one instance of the menu is supported
                destroyFunction = function(ev){
                    ev = ev || { manualDismiss: true };
                    
                    if (dom && (
                            (ev.target && typeof ev.target.className !== 'undefined' && !ev.target.className.toString().match(itemClass)) || 
                             ev.type === 'move' ||
                             ev.type === 'scroll' ||
                             ev.manualDismiss)
                       ){
                        // remove dom
                        dom.parentElement.removeChild(dom);
                        // remove the event
                        $(document.body).off('click', destroyFunction);
                        // remove the proximity dismiss
                        proximityDismiss.remove();
                        // reset dom variable
                        dom = undefined;
                    }
                },
                control,
                language = {},
                useHoverEnter = false,
                redactionReasons = {},
                // get a new proximityDismiss object to use for this menu
                proximityDismiss = ProximityDismiss(viewer.$dom);
            
            function addRedactionReasonActions () {

                if ( redactionReasons.enableRedactionReasonSelection === false) {
                    return;
                }

                _.each(redactionReasons.reasons, function (reason) {
                    actions.push({
                        name: 'Apply Reason: ' + reason.reason,
                        action: function (ev, mark) {
                            if (reason.reason === '-Clear Reason-') {
                                mark.setReason('');
                            } else {
                                mark.setReason(reason.reason);
                            }
                        },
                        valid: function (event, type) {
                            return (type === 'RectangleRedaction' || type === "TextSelectionRedaction") ? true : false;
                        }
                    });
                });
            }

            function createDOM(elem, ev, mark){
                var eventType = ev.getType().toLowerCase(),
                    newClassName = elem.className + ' ' + menuClass;

                elem.className = newClassName;

                _.forEach(actions, function(item){
                    if (item.valid(eventType, mark && mark.getType())) {
                        var li = document.createElement('li');
                        // escape any possible unsafe characters in the name
                        li.appendChild( document.createTextNode(language[item.languageKey] || item.name) );
                        li.className = itemClass;

                        // add onclick event
                        li.onclick = function(){
                            var retValue = item.action(ev, mark);

                            // destroy the menu after any item is clicked
                            if (retValue !== false) {
                                destroyFunction();
                            }
                        };

                        elem.appendChild(li);
                    }
                });
            }
            
            function positionMenuDOM(clientX, clientY) {
                var clientYscroll = clientY + (window.scrollY || document.body.scrollTop || document.documentElement.scrollTop || 0),
                    clientXscroll = clientX + (window.scrollX || document.body.scrollLeft || document.documentElement.scrollLeft || 0),
                    domBB = dom.getBoundingClientRect(),
                    width = domBB.width || domBB.right - domBB.left,
                    height = domBB.height || domBB.bottom - domBB.top,
                    offset = 10,
                    windowHeight = $(window).height(),
                    windowWidth = $(window).width(),
                    top = Math.min(clientYscroll + offset, (windowHeight - height - offset)),
                    left = Math.min(clientXscroll + offset, (windowWidth - width - offset)),
                    triggerDomBB = domBB,
                    triggerHeight = height,
                    triggerWidth = width,
                    style = { top: top + 'px', left: left + 'px'};

                if (useHoverEnter) {
                    // apply the hover trigger class here if requested
                    dom.className += ' ' + hoverTriggerClass;
                    triggerDomBB = dom.getBoundingClientRect();
                    triggerHeight = triggerDomBB.height || triggerDomBB.bottom - triggerDomBB.top;
                    triggerWidth = triggerDomBB.width || triggerDomBB.right - triggerDomBB.left;
                }

                if (clientYscroll + height + offset > windowHeight) {
                    // menu will display past the bottom edge
                    if (useHoverEnter && (clientY + triggerHeight + offset > windowHeight)) {
                        style.bottom = offset + 'px';
                    } else {
                        style.bottom = (windowHeight - clientYscroll - offset) + 'px';
                    }

                    style.top = 'auto';
                }

                if (clientXscroll + width + offset > windowWidth) {
                    // menu will display past the right edge
                    if (useHoverEnter && (clientX + triggerWidth + offset > windowWidth)) {
                        style.right = offset + 'px';
                    } else {
                        style.right = (windowWidth - clientXscroll - offset) + 'px';
                    }

                    style.left = 'auto';
                }

                var styleString = _.map(style, function(val, name){ return name + ':' + val; }).join(';');
                dom.setAttribute('style',  styleString);
            }

            function replaceMenu(ev) {
                if (ev.clientX !== undefined && ev.clientY !== undefined) {
                    var newDom = document.createElement('ul');
                    if (ev.mark) {
                        // create a menu for the specific mark type
                        createDOM(newDom, ev, ev.mark);
                    } else if (ev.textSelection) {
                        // create a menu for the selected text
                        createDOM(newDom, ev);
                    } else {
                        // this event is not interesting, exit now
                        return;
                    }
                    
                    $(dom).empty().append(newDom.children).removeAttr('style');
                    positionMenuDOM(ev.clientX, ev.clientY);
                }
            }
            
            function menuHandler(ev) {
                if (ev.mark && ev.mark.getType() === PCCViewer.Mark.Type.TextHyperlinkAnnotation) {
                    // close a menu if it already exists, but do not create a new one
                    // hyperlink oncreate action is handled by the hyperlink menu
                    if (dom) {
                        destroyFunction();
                    }
                    return;
                }
                
                if (ev.clientX !== undefined && ev.clientY !== undefined) {
                    // Just to make sure we never have multiple menus, reuse the DOM container created previously when possible.
                    if (dom) {
                        destroyFunction();
                    }

                    dom = document.createElement('ul');
                    
                    if (ev.mark) {
                        // create a menu for the specific mark type
                        createDOM(dom, ev, ev.mark);
                    } else if (ev.textSelection) {
                        // create a menu for the selected text
                        createDOM(dom, ev);
                    } else {
                        // this event is not interesting, exit now
                        return;
                    }

                    // check if any actions are available
                    if (dom.children.length === 0) {
                        // there are no actions available for this event
                        // exit without showing a menu
                        return;
                    }

                    // insert the DOM into the document body
                    document.body.appendChild(dom);

                    // set position after the element is in the DOM
                    positionMenuDOM(ev.clientX, ev.clientY);

                    // make sure trigger doesn't auto-click the first item if using a touchscreen
                    if (useHoverEnter) {
                        // fix for touch screens and the hover menu
                        $(dom).on('touchstart', function(ev){
                            // if the target is not an li, stop this event from continuing to a click
                            if (ev.target.tagName.toLowerCase() !== 'li') {
                                ev.preventDefault();
                                ev.stopPropagation();
                                return false;
                            }
                        });
                    }

                    // destroy the menu if anything other than the menu is clicked
                    $(document.body).on('click', destroyFunction);
                    // add a proximity desctory, to remove the menu if the user moves away from it
                    proximityDismiss.add({
                        clientX: ev.clientX,
                        clientY: ev.clientY,
                        dom: dom
                    }, destroyFunction);
                }
            }
            
            function init(viewerControl, mode, reasons, languageOptions) {
                redactionReasons = reasons;
                control = viewerControl;
                language = languageOptions;
                useHoverEnter = (mode === 'hover');

                // add viewer event listeners
                control.on(PCCViewer.EventType.MarkCreated, menuHandler);
                control.on(PCCViewer.EventType.TextSelected, menuHandler);
                
                addRedactionReasonActions();
            }

            return {
                init: init
            };
        })();

        // This module manages the comments interface and interacting with the comments.
        var commentUIManager = (function(){
            var editModeKey = 'Accusoft-isInEditMode',
                prevTextKey = 'Accusoft-previousText',
                selectedStateKey = 'Accusoft-selectedState',
                highlightKey = 'Accusoft-highlight',
                control,
                template,
                language,
                dateFormat,
                $commentsPanelViewerNode,
                // Steal jQuery to use its event framework.
                $event = $({}),
                dismissEvent = 'dismissPending';

            $event.store = {};

            function dismissCommentEdit(comment, opts) {
                // Clear the dismiss event listener on the body.
                if (opts.bodyClickDismiss && typeof opts.bodyClickDismiss === 'function') {
                    $(document.body).off('click', opts.bodyClickDismiss);
                }

                if (opts.cancel && opts.editMode === 'create') {
                    opts.conversation.deleteComments(comment);
                } else if (opts.cancel && opts.editMode === 'edit') {
                    comment.setData(editModeKey, undefined);
                    if (control.getMarkById(opts.conversation.getMark().getId())) {
                        control.refreshConversations(opts.conversation);
                    }
                } else if (opts.save) {
                    var val = $(opts.textarea).val(),
                        prevText = comment.getText();

                    if (val === prevText) {
                        // if text didn't change, treat this as a cancel
                        opts.cancel = true;
                        opts.save = false;
                        dismissCommentEdit(comment, opts);
                    } else if (val !== undefined) {
                        comment.setData(editModeKey, undefined);
                        comment.setText(val);
                    }
                }
            }
            
            function parseHighlightString(str) {
                var parts = str.split('|');
                var selections = _.map(parts, function(part){
                    return (function(){
                        var query = {},
                            temp = part.split('&');
                        for (var i = temp.length; i--;) {
                            var q = temp[i].split('='),
                                key = q.shift(),
                                value = q.join('=');
                            /* jshint -W116 */
                            // we want to take advantage of type coercion here
                            query[key] = (+value == value) ? +value : value;
                            /* jshint +W116 */
                        }
                        return query;
                    })();
                });
                
                return PCCViewer.Util.calculateNonOverlappingSelections(selections, '#ffffff');
            }

            function conversationDOMFactory(conversation, state, existingDOM){
                if (conversation.getComments().length === 0) {
                    return;
                }

                // Get the mark ID
                var markId = conversation.getMark().getId();

                // Check if this is a selection state change
                var selectedState = conversation.getData(selectedStateKey);

                if (selectedState === 'in' && existingDOM) {
                    $(existingDOM).addClass('pcc-conversation-selected');
                    conversation.setData(selectedStateKey, undefined);
                    return existingDOM;
                } else if (selectedState === 'out' && existingDOM) {
                    $(existingDOM).removeClass('pcc-conversation-selected');
                    conversation.setData(selectedStateKey, undefined);
                    return existingDOM;
                }

                // Just in case this factory gets called with state hints and no DOM
                if (selectedState) {
                    conversation.setData(selectedStateKey, undefined);
                }

                var dom = document.createElement('div');
                dom.className = 'pcc-conversation';

                var comments = conversation.getComments();
                _.forEach(comments, function(el, i, arr){
                    var fragment = document.createElement('div'),
                        editMode = el.getData(editModeKey),
                        highlight = el.getData(highlightKey),
                        date = formatDate(el.getCreationTime(), dateFormat.toString()),
                        commentId = markId.toString() + 'c' + i;

                    // Create the DOM for each comment
                    $(template({
                        comment: el,
                        editMode: editMode,
                        prevText: el.getText(),
                        date: date,
                        language: language,
                        first: (i === 0),
                        last: (i === arr.length - 1)
                    })).appendTo(fragment);

                    var $textarea = $(fragment).find('textarea');

                    // A highlight was requested by the advanced search module
                    if (highlight) {
                        // Get parsed values
                        var highlightValues = parseHighlightString(highlight);
                        
                        // We will need to build the highlighted text DOM manually
                        var $div = $(fragment).find('.pcc-comment-text'),
                            textFragment = document.createDocumentFragment(),
                            // get the comment text
                            text = el.getText(),
                            textPart = '',
                            span;
                        
                        _.forEach(highlightValues, function(val, i, arr){
                            if (i === 0) {
                                // this is text before any selections begin
                                // get the string from 0 to the start index
                                textPart = text.substring(0, val.startIndex);
                                textFragment.appendChild( document.createTextNode(textPart) );
                            }
                            
                            span = null;
                            span = document.createElement('span');
                            // get the string from the start index with the correct length
                            textPart = text.substr(val.startIndex, val.length);
                            span.style.background = val.color;
                            
                            span.appendChild( document.createTextNode(textPart) );
                            textFragment.appendChild(span);
                            
                            if (arr[i + 1] && val.endIndex + 1 < arr[i + 1].startIndex) {
                                // there is text between this selection and the next
                                textPart = text.substring(val.endIndex + 1, arr[i + 1].startIndex);
                                textFragment.appendChild( document.createTextNode(textPart) );
                            }
                            
                            if (i === arr.length - 1) {
                                // this is text after all the selections
                                // get the string from the end of the last selection to the end of the string
                                textPart = text.substr(val.startIndex + val.length);
                                textFragment.appendChild( document.createTextNode(textPart) );
                            }
                        });
                        
                        
                        $div.empty();

                        $div.append(textFragment);
                    }

                    // Create a dismiss function to use to dismiss this comment.
                    // All dismiss processes should call this function, so cleanup is performed.
                    function dismissFunction(){
                        // Remove comment dismiss and body dismiss event listeers.
                        $event.off(dismissEvent, dismissFunction);
                        $(document.body).off('click', bodyClickDismiss);

                        // Try to get the dismiss function for this comment
                        var dismissFunc = $event.store[commentId + 'dismiss'];

                        if (dismissFunc && typeof dismissFunc === 'function') {
                            dismissFunc();
                        }
                    }

                    function bodyClickDismiss(ev) {
                        // Check for a .pcc-comment parent
                        var $parent = $(ev.target).hasClass('pcc-comment') ? $(ev.target) : $(ev.target).parent('.pcc-comment');

                        // Check if the move context menu or context menu options is clicked
                        // Do not dismiss if one of these options are clicked
                        var contextMenuClick =  $(ev.target).data();
                        if (contextMenuClick.pccMoveContextMenu !== undefined || contextMenuClick.pccToggle === "context-menu-options") {
                          return;
                        }

                        // Check if the textarea for this comment is inside the clicked parent.
                        // Dismiss only if clicking outside of the comment currently in edit mode.
                        if (!($parent.length && $textarea.length && $.contains($parent.get(0), $textarea.get(0)))) {
                            if ($textarea.val() === '' && editMode === 'edit') {
                                // Do not allow the user to dismiss a comment from Edit mode if the text is empty.
                                return;
                            }

                            // Trigger a dismiss, to automatically dismiss all comments and clean up.
                            $event.trigger(dismissEvent);
                        }
                    }

                    // Partial options object for dismissing comment edits.
                    var dismissOpts = {
                        editMode: editMode,
                        commentId: commentId,
                        bodyClickDismiss: bodyClickDismiss,
                        dismissFunction: dismissFunction,
                        textarea: $textarea,
                        conversation: conversation
                    };

                    if (editMode) {
                        // Store only one dismiss function for each comment.
                        $event.store[commentId + 'dismiss'] = function dismissComment(){
                            // Remove self when executing
                            delete $event.store[commentId + 'dismiss'];

                            dismissOpts.save = true;
                            dismissCommentEdit(el, dismissOpts);
                        };

                        // Listen to dismiss events and dismiss this comment.
                        $event.one(dismissEvent, dismissFunction);

                        // Clicking anywhere outside the comment will save it, or cancel if no edits were done.
                        $(document.body).on('click', bodyClickDismiss);
                    }

                    // Add click handlers
                    $(fragment).children()
                        // listen to clicks on the Done button for comment editing
                        .on('click', '[data-pcc-comment="done"]', function(){
                            dismissOpts.save = true;
                            dismissFunction();
                        })
                        // listen to clicks on the Cancel button for comment editing
                        .on('click', '[data-pcc-comment="cancel"]', function(){
                            dismissOpts.cancel = true;
                            dismissFunction();
                        })
                        // listen to overflow menu trigger on touch screens
                        .on('touchend', '.pcc-comment-menu-trigger', function(ev){
                            ev.preventDefault();
                            $(this).parent('[data-pcc-comment-menu]').toggleClass('pcc-expanded');
                        })
                        .on('click', '[data-pcc-comment-delete]', function(ev){
                            // Keep this event from registering on the bodyClickDismiss handler
                            ev.stopPropagation();

                            // Make sure this button dismisses any other comment that is being edited.
                            // This includes comments that may belong to a different conversation.
                            $event.trigger(dismissEvent);

                            conversation.deleteComments(el);
                        })
                        .on('click', '[data-pcc-comment-edit]', function(ev){
                            // Keep this event from registering on the bodyClickDismiss handler.
                            ev.stopPropagation();

                            // Make sure this button dismisses any other comment that is being edited.
                            // This includes comments that may belong to a different conversation.
                            $event.trigger(dismissEvent);

                            el.setData(editModeKey, 'edit');
                            control.refreshConversations(conversation);
                        })
                        .on('click', function(ev){
                            if (control.getSelectedConversation() !== conversation) {
                                // Deselect any previous marks
                                control.deselectAllMarks();
                                // Select the mark associated to the conversation that was clicked on
                                control.selectMarks([conversation.getMark()]);
                            }
                        })
                        .appendTo(dom);

                    // Check if there is a textarea.
                    if ($textarea.length) {
                        var $doneButton = $(dom).find('[data-pcc-comment="done"]');

                        var disableDone = function(){
                            if ($doneButton.attr('disabled') !== 'disabled') {
                                $doneButton.attr('disabled', 'disabled');
                            }
                        };

                        var enableDone = function(){
                            if ($doneButton.attr('disabled')) {
                                $doneButton.removeAttr('disabled');
                            }
                        };

                        // Listen to key events on the textarea
                        $textarea.on('keyup', function(){
                            if (this.value === "") {
                                disableDone();
                            } else {
                                enableDone();
                            }
                        });

                        // Disable the Done button by default.
                        disableDone();

                        // Focus the textarea so that the user can start typing.
                        // Do this on the next event loop.
                        _.defer(function(){
                            $textarea.focus();
                        });
                    }
                });

                if (state && state.isSelected) {
                    dom.className += ' pcc-conversation-selected';
                }

                // add JS hover handlers for legacy IE, which will not handle CSS hovers
                if (dom.attachEvent) {
                    var $hoverMenu = $(dom).find('[data-pcc-comment-menu]')
                        .on('mouseenter', function(ev){
                            $hoverMenu.addClass('pcc-expanded');
                        })
                        .on('mouseleave', function(ev){
                            $hoverMenu.removeClass('pcc-expanded');
                        });
                }

                return dom;
            }

            function onSingleMarkSelected(mark) {
                var conversation = mark.getConversation();

                if (conversation.getComments().length) {
                    // get the current selected conversation
                    var prevConversation = control.getSelectedConversation();

                    // check if this is the same one as on this mark
                    if (prevConversation === conversation) {
                        // it is already selected, so do nothing
                        return;
                    }

                    // check if there was a selected conversation that needs to be transitioned out
                    if (prevConversation) {
                        prevConversation.setData(selectedStateKey, 'out');
                    }

                    // transition the new conversation in
                    conversation.setData(selectedStateKey, 'in');

                    control.setSelectedConversation(conversation);
                }
            }

            function onMarkSelected(ev) {
                var selectedMarks = control.getSelectedMarks();

                var singleMark = true, previousMarkId;
                
                if (selectedMarks.length === 0) {
                    singleMark = false;
                } else if (selectedMarks.length > 1) {
                    _.forEach(selectedMarks, function(mark, key){
                        if (previousMarkId) {
                            singleMark = (previousMarkId === mark.id) && singleMark;
                        }
                        previousMarkId = mark.id;
                    });
                } 
                
                if (singleMark && selectedMarks[0].getConversation().getComments().length) {
                    // If there is only one mark, and it has comments, select the conversation view
                    onSingleMarkSelected(selectedMarks[0]);
                } else {
                    // Check if there was a selected conversation that needs to be transitioned out
                    var prevSelected = control.getSelectedConversation();
                    if (prevSelected) {
                        prevSelected.setData(selectedStateKey, 'out');
                    }

                    // Deselect previous conversation
                    control.setSelectedConversation(null);
                }
            }

            function init(viewerControl, commentTemplate, languageOptions, commentDateFormat, commentsPanelViewerNode){
                control = viewerControl;
                language = languageOptions;
                template = _.template(commentTemplate.replace(/>[\s]{1,}</g, '><'));
                dateFormat = commentDateFormat || 'MM/DD/YYYY h:mma';
                $commentsPanelViewerNode = commentsPanelViewerNode;

                control.setConversationDOMFactory(conversationDOMFactory);
                control.on(PCCViewer.EventType.MarkSelectionChanged, onMarkSelected);

                control.on(PCCViewer.EventType.MarkupLoaded, function(){
                    // Markup was loaded, so we need to check if there are any comments
                    var commentsFound = false;
                    _.forEach(control.getAllMarks(), function(mark) {
                        if (commentsFound) {
                            return;
                        }

                        if (mark.getConversation().getComments().length) {
                            commentsFound = true;
                        }
                    });

                    // If there were comments in the Markup, open the comments panel
                    if (commentsFound) {
                        $commentsPanelViewerNode.addClass('pcc-active');
                        control.openCommentsPanel();
                        if (typeof viewer.activeFitType !== 'undefined') { viewer.viewerControl.fitContent(viewer.activeFitType); }
                        viewer.viewerNodes.$pageList.find('.pccPageListContainerWrapper').scrollLeft(viewer.viewerNodes.$pageList.find('.pccPageListContainerWrapper > div:first-child').width());
                    }
                });
            }

            function addComment(conversation){
                // Dismiss all comments that are currently in edit mode
                $event.trigger(dismissEvent);

                if (!control.getIsCommentsPanelOpen()){
                    $commentsPanelViewerNode.addClass('pcc-active');
                    control.openCommentsPanel();
                    if (typeof viewer.activeFitType !== 'undefined') { viewer.viewerControl.fitContent(viewer.activeFitType); }
                }

                var comment = conversation.addComment("");
                comment.setData(editModeKey, 'create');
            }

            return {
                init: init,
                addComment: addComment
            };
        })();

        // This module manages downloading the original file, as well as burning in redactions and signatures.
        var fileDownloadManager = (function(){
            var control, template, language,
                // Retrieve the document name from the viewer initialization parameter
                originalName = options.documentDisplayName ? options.documentDisplayName.replace(/\..+$/, '') : undefined;

            function init(viewerControl, downloadTemplate, languageOptions) {
                control = viewerControl;
                template = downloadTemplate;
                language = languageOptions;
            }

            function onSuccessDownloadURL(url, $overlay, $overlayFade) {
                showOverlay($overlay, $overlayFade, { mode: 'complete' })
                .on('click', '.pcc-overlay-download', function(){
                    window.open(url);
                    hideOverlay($overlay, $overlayFade);
                });
            }

            function onFailure(reason, originalOptions, $overlay, $overlayFade) {
                showOverlay($overlay, $overlayFade, { mode: 'error' })
                .on('click', '.pcc-overlay-retry', function(){
                    burnMarkup(originalOptions, $overlay, $overlayFade);
                });
            }

            function burnMarkup(options, $overlay, $overlayFade){
                var burnRequest, complete = false;

                showOverlay($overlay, $overlayFade, { mode: 'pending' })
                .on('click', '.pcc-overlay-cancel', function(ev) {
                    hideOverlay($overlay, $overlayFade);
                    if (burnRequest && burnRequest.cancel && !complete) {
                        burnRequest.cancel();
                    }
                });

                burnRequest = control.burnMarkup(options);
                burnRequest.then(function success(url){
                    complete = true;
                    onSuccessDownloadURL(url, $overlay, $overlayFade);
                }, function failure(reason){
                    complete = true;
                    // Check if the Promise was rejected due to a user cancel
                    if (reason !== "User Cancelled") {
                        onFailure(reason, options, $overlay, $overlayFade);
                    }
                });
            }

            function getAvailableMarkTypes() {
                var allMarks = control.getAllMarks(),
                    availableTypes = {},
                    type;

                _.forEach(allMarks, function(mark){
                    type = mark.getType();

                    if (type.match(/redaction/i)) {
                        availableTypes.redaction = true;
                    } else if (type.match(/signature/i)) {
                        availableTypes.signature = true;
                    }
                });

                return availableTypes;
            }

            function hideOverlay($overlay, $overlayFade) {
                $overlay.html('').removeClass('pcc-open');
                $overlayFade.hide();

                // remove all event listeners
                $overlay.off();
            }

            function showOverlay($overlay, $overlayFade, templateOptions){
                templateOptions = templateOptions || {};
                templateOptions.mode = templateOptions.mode || 'select';
                templateOptions.language = language;

                var availableMarkTypes = getAvailableMarkTypes();
                if (!availableMarkTypes.redaction && !availableMarkTypes.signature) {
                    // There are no burnable marks on this document.
                    // Assume that the user is just trying to download the original.
                    window.open(control.getDownloadDocumentURL());
                    return;
                }

                templateOptions.types = availableMarkTypes;

                $overlayFade.show();
                $overlay.html(_.template(template, {
                    options: templateOptions
                })).addClass('pcc-open')
                .on('click', 'button[data-pcc-download]', function(ev) {
                    var which = $(ev.target).data('pcc-download'),
                        burnOptions = {};

                    switch (which) {
                        case 'original':
                            // we already have this URL, skip straight to download
                            onSuccessDownloadURL(control.getDownloadDocumentURL(), $overlay, $overlayFade);
                            break;
                        case 'redacted':
                            burnOptions.burnRedactions = true;
                            burnOptions.burnSignatures = false;
                            burnOptions.filename = originalName + '-redacted';
                            burnMarkup(burnOptions, $overlay, $overlayFade);
                            break;
                        case 'signed':
                            burnOptions.burnRedactions = false;
                            burnOptions.burnSignatures = true;
                            burnOptions.filename = originalName + '-signed';
                            burnMarkup(burnOptions, $overlay, $overlayFade);
                            break;
                        case 'both':
                            burnOptions.burnRedactions = true;
                            burnOptions.burnSignatures = true;
                            burnOptions.filename = originalName + '-redacted-and-signed';
                            burnMarkup(burnOptions, $overlay, $overlayFade);
                            break;
                    }
                })
                .on('click', '.pcc-overlay-closer', function(ev) {
                    hideOverlay($overlay, $overlayFade);
                });

                return $overlay;
            }

            return {
                init: init,
                showOverlay: showOverlay
            };
        })();

        // Image Stamp module
        this.imageStamp = (function () {
            var stampApi,
                imageStampList,
                imageStampListTimestamp = 0,
                imageStampListTtl = 10 * 60, // 10 minutes
                imageStampMruTime = 0,
                sortByOptions = [options.language.imageStampSortByRecentlyUsed, options.language.imageStampSortByFileName],
                sortKey = 'recentlyUsedTime',
                sortName = sortByOptions[0],
                sortOrder = 'desc',
                annotationTool,
                redactionTool,
                noop = function(){},
                imageStampDataMap = {},
                $event = $({}),
                $overlay,
                $toolButtons;

            var init = function (viewerNodes) {
                stampApi = new PCCViewer.ImageStamps(options);
                
                annotationTool = PCCViewer.MouseTools.getMouseTool('AccusoftImageStampAnnotation');
                redactionTool = PCCViewer.MouseTools.getMouseTool('AccusoftImageStampRedaction');
                $toolButtons = $('[data-pcc-mouse-tool="AccusoftImageStampAnnotation"], [data-pcc-mouse-tool="AccusoftImageStampRedaction"]');
                
                $overlay = viewerNodes.$imageStampOverlay;

                attachListeners();

                // this will initialize the image list and the mouse tools
                initImageStampMouseTools();
            };

            var initImageStampMouseTools = function(){
                loadStampList(function(list){
                    var mostRecentImage,
                        mostRecentTime = Number.NEGATIVE_INFINITY;

                    // transform the stored list into a lookup object
                    var storedList = _.reduce(storageGetImageStampList().imageStampList.imageStamps, function(seed, el){
                        seed[el.id] = el;
                        return seed;
                    }, {});
                        
                    _.forEach(list.imageStamps, function(el) {
                        // overwrite most recently used time with the time from the previously stored list if necessary
                        var localObj = storedList[el.id];
                        if (localObj && localObj.recentlyUsedTime > el.recentlyUsedTime) {
                            el.recentlyUsedTime = localObj.recentlyUsedTime;
                        }
                        
                        // find the most recently used image
                        if (el.recentlyUsedTime > mostRecentTime) {
                            mostRecentTime = el.recentlyUsedTime;
                            mostRecentImage = el;
                        }
                });

                    if (mostRecentImage) {
                        requestImageData(mostRecentImage, function(err, response){
                            if (err) {
                                $toolButtons.attr('disabled', 'disabled');
                                return;
                            }
                            
                            setToolsImage({
                                dataUrl: response.dataUrl,
                                id: response.dataHash
                            });
                            
                            $toolButtons.removeAttr('disabled');
                        });
                    } else {
                        $toolButtons.attr('disabled', 'disabled');
                    }
                    
                    storeImageStampList();
                });
            };
            
            var requestImageData = function(image, done){
                done = (typeof done === 'function') ? done : noop;
                
                if (imageStampDataMap[image.id]) {
                    // this image exists, so use the same data
                    done(undefined, imageStampDataMap[image.id].data);
                    return;
                }
                
                // we did not find existing image data, so request it
                stampApi.reqestImageSourceBase64(image.id).then(function(response){
                    // save this image in the hash of known images
                    imageStampDataMap[image.id] = {
                        data: response,
                        image: image
                    };
                    
                    done(undefined, response);
                }, function fail(reason){
                    done(reason);
                });
            };

            var setToolsImage = function(newImage){
                // set both mouse tools to use the same image
                annotationTool.getTemplateMark().setImage(newImage);
                redactionTool.getTemplateMark().setImage(newImage);
            };

            var attachListeners = function () {
                $overlay.on('click', '.pcc-image-stamp-list-item', function (ev) {
                    ev.stopPropagation();
                    ev.preventDefault();
                    
                    itemSelectionHandler(this);
                });

                $overlay.on('click', '[data-pcc-image-stamp=closer]', function (ev) {
                    ev.stopPropagation();
                    ev.preventDefault();
                    hideOverlay();
                });

                $overlay.on('click', '[data-image-stamp-sort-item]', function (ev) {
                    ev.stopPropagation();
                    ev.preventDefault();
                    sortSelectionHandler(this);
                });
            };

            // Launch image stamp selection modal
            var showOverlay = function () {
                // show the overlay immediately in "loading" mode
                drawOverlay({
                    waiting: true
                });

                loadStampList(function done(list){
                    sortList();
                    // update the overlay to show the new data
                    drawOverlay({
                        waiting: false
                    });
                });

                $overlay.addClass('pcc-open');

                // Show the dark overlay
                viewer.viewerNodes.$overlayFade.show();
            };

            var drawOverlay = function (params) {
                $overlay.html(_.template(options.template.imageStampOverlay, _.extend({
                    waiting: params.waiting,
                    imageStampList: imageStampList,
                    sortBy: sortByOptions,
                    sortKey: sortKey,
                    sortName: sortName,
                    sortOrder: sortOrder
                }, options.language)));
            };

            var hideOverlay = function () {
                $overlay.removeClass('pcc-open');

                $event.off('imageSelect');

                // Remove the dark overlay
                viewer.viewerNodes.$overlayFade.hide();
            };

            var storeImageStampList = function () {
                if (localStorage && imageStampList && imageStampListTimestamp) {
                    var storageObj = {
                        imageStampList: imageStampList,
                        imageStampListTimestamp: imageStampListTimestamp
                    };

                    localStorage.setItem('pccvImageStampList', JSON.stringify(storageObj));
                }
            };

            var storageGetImageStampList = function () {
                if (localStorage) {
                    var storageObj = JSON.parse(localStorage.getItem('pccvImageStampList'));

                    if (storageObj) {
                        _.each(storageObj.imageStampList.imageStamps, function (imageStamp) {
                        if (imageStamp.recentlyUsedTime > imageStampMruTime) {
                            imageStampMruTime = imageStamp.recentlyUsedTime;
                        }
                    });
                        
                        return storageObj;
                }
                }
                
                // return an empty list if nothing was found in local storage
                return {
                    imageStampList: { imageStamps: [] },
                    imageStampListTimestamp: 0
                };
            };

            var itemSelectionHandler = function (itemEl) {
                var stampId = $(itemEl).attr('data-image-stamp-id');

                var imageObj = _.find(imageStampList.imageStamps, function (imageStamp) {
                    return imageStamp.id === stampId;
                });

                imageObj.recentlyUsedTime = imageStampMruTime = Math.round((new Date()).getTime() / 1000);
                storeImageStampList();

                requestImageData(imageObj, function(err, response){
                    if (err) {
                        viewer.notify({
                            message: options.language.imageStampUnableToLoadImage
                                        });

                        hideOverlay();
                        return;
                    }
                    
                    // trigger and imageSelect event
                    $event.trigger('imageSelect', {
                                            dataUrl: response.dataUrl,
                                            id: response.dataHash
                                        });

                        hideOverlay();
                        });
            };

            var sortSelectionHandler = function (sortEl) {
                sortName = $(sortEl).data('image-stamp-sort-item');

                switch (sortName) {
                    case options.language.imageStampSortByRecentlyUsed:
                        if (sortKey === 'recentlyUsedTime') {
                            sortOrder = (sortOrder === 'desc') ? 'asc' : 'desc';
                        } else {
                            sortOrder = 'desc';
                        }
                        sortKey = 'recentlyUsedTime';
                        break;

                    case options.language.imageStampSortByFileName:
                        if (sortKey === 'displayName') {
                            sortOrder = (sortOrder === 'desc') ? 'asc' : 'desc';
                        }
                        sortKey = 'displayName';
                        break;
                }

                sortList();

                drawOverlay({
                    waiting: false
                });
            };

            var sortList = function () {
                if ((sortKey === 'recentlyUsedTime' && imageStampMruTime === 0) ||
                        typeof sortName === 'undefined' ||
                        typeof sortOrder === 'undefined') {
                    return;
                }

                if (sortKey) {
                    imageStampList.imageStamps = _.sortBy(imageStampList.imageStamps, sortKey);
                }

                if (sortOrder === 'desc') {
                    imageStampList.imageStamps = imageStampList.imageStamps.reverse();
                }
            };

            var loadStampList = function (done) {
                done = (typeof done === 'function') ? done : noop;
                
                var now = Math.round((new Date()).getTime() / 1000);

                // check to see if cached list has expired
                if (imageStampListTimestamp + imageStampListTtl > now) {
                    done(imageStampList);
                    $toolButtons.removeAttr('disabled');
                } else {
                    stampApi.requestImageStampList().then(
                        //success
                        function (listResponse) {
                            imageStampList = listResponse;
                            imageStampListTimestamp = Math.round((new Date()).getTime() / 1000);

                            _.each(imageStampList.imageStamps, function (imageStampObj, index) {
                                imageStampList.imageStamps[index].url = stampApi.getImageSourceURL(imageStampObj.id);
                                imageStampList.imageStamps[index].recentlyUsedTime = 0;
                            });

                            done(imageStampList);
                            $toolButtons.removeAttr('disabled');
                        },
                        //failure
                        function (response) {
                            viewer.notify({
                                message: options.language.imageStampUnableToLoad
                            });
                            $toolButtons.attr('disabled', 'disabled');
                        }
                    );
                }
            };

            var getImageUrl = function(imageData){
                return imageData;
            };
            
            var selectToolImage = function(done){
                done = (typeof done === 'function') ? done : noop;
                
                $event.one('imageSelect', function(ev, data){
                    setToolsImage(data);
                    done(data);
                });
                
                showOverlay();
            };
            
            var selectMarkImage = function(done){
                done = (typeof done === 'function') ? done : noop;
                
                $event.one('imageSelect', function(ev, data){
                    done(data);
                });
                
                showOverlay();
            };

            return {
                init: init,
                getImageUrl: getImageUrl,
                selectToolImage: selectToolImage,
                selectMarkImage: selectMarkImage
            };
        })();

        // Initialize the viewer
        viewer.initializeViewer();

        // Defines the public members returned by the Viewer
        var publicViewer = {
            // The main ViewerControl API for this Viewer instance
            viewerControl: viewer.viewerControl,

            // A method allowing the Viewer to be destroyed
            destroy: function () {
                viewer.destroy();
                this.viewerControl = undefined;

                // Destroy the eSignature module
                viewer.eSignature.destroy();
            }
        };

        // Store the publicViewer object associated with the element. The same object can be accessed
        // later, so that the viewer can be destroyed.
        this.$dom.data(DATAKEY, publicViewer);

        // Return the publicViewer object, so that the caller can access the ViewerControl and destroy() method..
        return publicViewer;
    }

    var Queue = function(){
        var deferArray = [],
            running = false;

        function recursiveExecute(done) {
            // maintain scope
            (function recurse(){
                if (running && deferArray.length) {
                    var func = deferArray.shift();

                    // continue on the next event loop iteration
                    setTimeout(function(){
                        func(recurse);
                    }, 0);
                } else {
                    if (done && (typeof done === 'function')) {
                        done();
                    }
                }
            })();
        }

        this.push = function(func) {
            deferArray.push(function(cb){
                func();
                cb();
            });
        };

        this.run = function(done){
            running = true;
            recursiveExecute(done);
        };

        this.stop = function(){
            running = false;
            return deferArray;
        };

        this.isRunning = function(){
            return running;
        };
    };
    
    var ProximityDismiss = function(viewerDom){
        // generate a new instance every time this function is called
        // it needs access to the dom element in which the viewer is embedded
        return (function (){
            var globalOpts = {},
                onDismiss,
                proximityEnabled = false,
                firstMoveRecorded = false,
                // 300 pixels away is the tolerance -- use 300^2 to improve performance
                distanceTolerance = 300 * 300,
                noop = function(){};

            function squaredDistance(x0, y0, x1, y1) {
                var xs = x0 - x1,
                    ys = y0 - y1;

                return (xs * xs) + (ys * ys);
            }

            function trackMouse(ev){
                if (!globalOpts.dom) {
                    // the dom was already destroyed, so trigger a dismiss
                    onDismiss();
                    return;
                }
                
                if (!firstMoveRecorded) {
                    firstMoveRecorded = true;
                    
                    // find the actual location of the menu, as it could be different on mobile
                    var rect = globalOpts.dom.getBoundingClientRect();
                    
                    // if the menu is far away on the first move, we will track the actual menu point instead of the options control point
                    if (squaredDistance(ev.clientX, ev.clientY, rect.left, rect.top) > distanceTolerance) {
                        // The menu is far away from the mouse, so we will wait to enable proximity tracking. We will also use the 
                        // actual menu location, and dismiss based on that.
                        globalOpts.controlX = rect.left;
                        globalOpts.controlY = rect.top;
                    } else {
                        // We are already close to the menu, so enable tracking by default. Use the original options point for tracking.
                        proximityEnabled = true;
                        globalOpts.controlX = globalOpts.clientX;
                        globalOpts.controlY = globalOpts.clientY;
                    }
                }
                
                if (ev.target === globalOpts.dom || $.contains(globalOpts.dom, ev.target)) {
                    // never destroy if the user is hovering over the menu itself
                    return;
                }
                
                var isFarAway = squaredDistance(ev.clientX, ev.clientY, globalOpts.controlX, globalOpts.controlY) > distanceTolerance;
                
                // Set to true once the mouse moves close to the menu. Once set to true, it will never reset.
                // This way we start tracking only after they have moved close enough.
                proximityEnabled = proximityEnabled || !isFarAway;
                
                if (firstMoveRecorded && proximityEnabled && isFarAway) {
                    onDismiss({ type: 'move' });
                }
            }
            
            // keep track of window resizing and scrolling, so they can be trottled a bit
            var scrollTimeout,
                resizeTimeout,
                onScrollDismiss = function(){
                    onDismiss({ type: 'scroll' });
                };
            
            function trackScroll(){
                if (scrollTimeout) {
                    // don't register a new timeout if there is already one
                    return;
                }
                
                // dismiss in a short amount of time
                scrollTimeout = setTimeout(function(){
                    scrollTimeout = undefined;
                    onScrollDismiss();
                }, 100);
            }
            function trackResize(){
                if (scrollTimeout) {
                    clearTimeout(scrollTimeout);
                    scrollTimeout = undefined;
                }
                
                if (resizeTimeout) {
                    clearTimeout(resizeTimeout);
                    resizeTimeout = undefined;
                }
                
                // Overload the dismiss function. On mobile devices, opening the keyboard will trigger
                // a scroll and page resize -- note, this happens on Android but not iOS. When scroll happens
                // together with a page resize, do not dismiss. It is most likely due to the touch keboard opening
                // on the device.
                var origOnScrollDismiss = onScrollDismiss;
                onScrollDismiss = noop;
                resizeTimeout = setTimeout(function(){
                    onScrollDismiss = origOnScrollDismiss;
                }, 800);
            }
            
            // keep track of the DOM element that will scroll, so we don't query for it multiple times
            // this will be the list of pages div
            var $scrollDom;
            
            function removeActiveListeners() {
                $(window).off('mousemove', trackMouse);
                $scrollDom.off('scroll', trackScroll);
                $(window).off('resize', trackResize);
                globalOpts = {};
                proximityEnabled = firstMoveRecorded = false;
                scrollTimeout = resizeTimeout = undefined;
            }
            
            return {
                add: function(opts, dismissFunc){
                    $scrollDom = $(viewerDom).find('.pccPageListContainerWrapper');
                    globalOpts = _.extend({
                        // default is to use both triggers
                        useScrollTrigger: true,
                        useMoveTrigger: true
                    }, opts);
                    onDismiss = function(ev) {
                        dismissFunc(ev);
                    };
                    
                    // add events that will dismiss the menu
                    if (globalOpts.useMoveTrigger) {
                        $(window).on('mousemove', trackMouse);
                    }
                    if (globalOpts.useScrollTrigger) {
                        $scrollDom.on('scroll', trackScroll);
                        $(window).scroll(trackScroll);
                        $(window).on('resize', trackResize);
                    }
                },
                remove: function(){
                    removeActiveListeners();
                }
            };
        })();
    };

    function formatDate(date, template) {
        var hours = date.getHours(),
            period = (hours >= 12) ? 'pm' : 'am',
            adjustedHours = (hours > 12) ? hours - 12 : (hours === 0) ? 12 : hours,
            year = date.getFullYear().toString(),
            yearLength = year.length,
            shortYear = year.slice(yearLength - 2, yearLength);

        function padNumber(val) {
            val = val.toString();
            while(val.length < 2) {
                val = '0' + val;
            }
            return val;
        }

        return template.replace(/MM/, padNumber( date.getMonth() + 1 ))
                .replace(/M/, date.getMonth() + 1)
                .replace(/DD/, padNumber(date.getDate()))
                .replace(/D/, date.getDate())
                .replace(/YYYY/, year )
                .replace(/YY/, shortYear)
                .replace(/HH/, padNumber(hours))
                .replace(/H/, hours)
                .replace(/hh/, padNumber(adjustedHours))
                .replace(/h/, adjustedHours)
                .replace(/mm/, padNumber(date.getMinutes()))
                .replace(/m/, date.getMinutes())
                .replace(/a/, period)
                .replace(/A/, period.toUpperCase());
    }

    var fontLoader = (function(){
        var isLegacyBrowser = document.documentMode && document.documentMode === 8,
            fonts = {
            // Safe serif and sans-serif fonts
            'Times New Roman': { useInLegacy: true },
            'Arial': { useInLegacy: true },

            // Web fonts
            'Cedarville Cursive': { useInLegacy: false },
            'Dancing Script': { useInLegacy: true },

            'La Belle Aurore': { useInLegacy: false },
            'Sacramento': { useInLegacy: true },

            'Pacifico': { useInLegacy: true },
            'Italianno': { useInLegacy: true },

            'Grand Hotel': { useInLegacy: true },
            'Great Vibes': { useInLegacy: true }
        };

        function load(){
            // Create a preloader div
            var preloader = document.createElement('div'),
                style = preloader.style,
                div;

            // Make sure the preloader is reasonably hidden
            style.position = 'absolute';
            style.top = style.left = '0';
            style.width = style.height = '0px';
            // Note: do not set zIndex to 0, as that would cause some browsers not to preload

            _.each(returnNames(), function(name){
                // create a temporary div
                div = document.createElement('div');
                div.style.fontFamily = '"' + name + '"';

                // add it to the preloader
                preloader.appendChild(div);
            });

            // Append the preloader to the body
            document.body.appendChild(preloader);

            // Remove the preloader on the next event loop
            setTimeout(function(){
                document.body.removeChild(preloader);
            }, 0);
        }

        // Check whether the font is safe to use in legacy browsers.
        // Mainly, IE8 has trouble rendering specific EOT fonts.
        function safeForLegacy(fontName) {
            return fonts[fontName] ? fonts[fontName].useInLegacy || false : false;
        }

        // Gets a list of all the fonts.
        function returnNames() {
            // filter out non-legacy fonts in legacy browsers
            return _.filter(_.keys(fonts), function(el){
                return !isLegacyBrowser  || fonts[el].useInLegacy;
            });
        }

        return {
            preLoad: load,
            names: returnNames,
            isLegacyBrowser: isLegacyBrowser
        };
    })();
    // This module manages the localStorage for signatures.
    // It populates the global, shared PCCViewer.Signatures collection
    var localSignatureManager = (function (){
        // the key to use in local storage
        var signatureStorageKey = 'pccvSignatures';
        // create a new non-blocking queue to load saved signatures
        var loadQueue = new Queue();

        function signatureAdded(){
            // overwrite signatures with PCCViewer.Signatures collection
            setStoredSignatures(PCCViewer.Signatures.toArray());
        }

        function signatureRemoved(){
            // overwrite signatures with PCCViewer.Signatures collection
            var signatureArr = PCCViewer.Signatures.toArray();
            setStoredSignatures(signatureArr);
        }

        var destroy = function() {
            if (loadQueue && loadQueue.isRunning()) {
                loadQueue.stop();
            }
        };

        var loadStoredSignatures = function () {
            var signatures = getStoredSignatures();

            var tempCount = signatures.length;

            while(tempCount--) {
                // Make sure this loop does not block the UI if there are a lot of signatures,
                // just in case. Also, ignore possible errors of generating functions inside a loop,
                // we need to queue up individual functions.
                /* jshint -W083 */
                loadQueue.push(function(){
                    if (signatures.length) {
                        var value = signatures.shift();

                        PCCViewer.Signatures.add(value);
                    }
                });
                /* jshint +W083 */
            }

            // execute the non-blocking queue
            loadQueue.run(function(){
                // this code will execute if the queue is done or is stopped
                if (signatures.length) {
                    saveSignaturesSync(signatures);
                }
            });
        };

        function getSignatureStorageTemplate() {
            return { values: [] };
        }

        function saveSignaturesSync(signatureArray) {
            // get the current stores signatures
            var signatures = PCCViewer.Signatures.toArray();

            // overwrite the saved signatures collection with the current and appended signatures
            setStoredSignatures(signatures.concat(signatureArray));
        }


        var getStoredSignatures = function () {
            var signatures = localStorage.getItem(signatureStorageKey);

            if (typeof signatures === 'undefined' || signatures === null) {
                // create empty signatures object
                signatures = getSignatureStorageTemplate();
            } else {
                // return current signatures object
                signatures = JSON.parse(signatures);
            }

            return signatures.values;
        };

        var setStoredSignatures = function (signaturesArray) {
            var sigTemplate = getSignatureStorageTemplate();

            // filter out signatures the user did not want to save
            sigTemplate.values = _.filter(signaturesArray, function(el){
                return el.localSave;
            });

            window.localStorage.setItem(signatureStorageKey, JSON.stringify(sigTemplate));
        };

        var clearAllStoredSignatures = function () {
            window.localStorage.removeItem(signatureStorageKey);
        };

        // Initialize the local storage manager
        PCCViewer.Signatures.on('ItemAdded', signatureAdded);
        PCCViewer.Signatures.on('ItemRemoved', signatureRemoved);

        // make sure this module is disposed if the user navigates away from the page
        $(window).on('beforeunload', function(){
            destroy();
        });

        loadStoredSignatures();

        return {
            getStored: getStoredSignatures,
            setStored: setStoredSignatures,
            clearAll: clearAllStoredSignatures
        };
    })();

    // Expose the Viewer through a jQuery plugin
    $.fn.pccViewer = function (options) {
        if (typeof options === 'undefined') {
            // If we are not given an options argument, return any existing viewer object associated with the
            // selected element.
            return this.data(DATAKEY);
        }
        else {
            // Create a new viewer
            return new Viewer(this, options);
        }
    };
})(jQuery);
