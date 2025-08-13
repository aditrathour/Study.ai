
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type } from '@google/genai';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// DOM Elements
const appHeader = document.getElementById('app-header') as HTMLElement;
const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
const topicInput = document.getElementById('topic-input') as HTMLTextAreaElement;
const urlInput = document.getElementById('url-input') as HTMLInputElement;
const fileInput = document.getElementById('file-upload') as HTMLInputElement;
const fileNameDisplay = document.getElementById('file-name') as HTMLParagraphElement;
const academicLevelSelect = document.getElementById('academic-level') as HTMLSelectElement;
const outputPanelWrapper = document.getElementById('output-panel-wrapper') as HTMLDivElement;
const outputContainer = document.getElementById('output-container') as HTMLDivElement;
const outputActions = document.getElementById('output-actions') as HTMLDivElement;
const loadingIndicator = document.getElementById('loading-indicator') as HTMLDivElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const exportPdfBtn = document.getElementById('export-pdf-btn') as HTMLButtonElement;
const exportDocxBtn = document.getElementById('export-docx-btn') as HTMLButtonElement;
const exportTxtBtn = document.getElementById('export-txt-btn') as HTMLButtonElement;
const authorBtn = document.getElementById('author-btn') as HTMLButtonElement;
const authorModal = document.getElementById('author-modal') as HTMLDivElement;
const modalCloseBtn = authorModal.querySelector('.modal-close-btn') as HTMLButtonElement;


let selectedFile: File | null = null;
let generatedData: any | null = null; // Store the last generated JSON data

const HINGLISH_QUOTES = [
    "Padhai-vadhai karo, IAS-YAS bano... but first, chai peelo.",
    "Yeh notes 'kal padhunga' folder mein nahi jaana chahiye.",
    "Iss topic ko aise samjho jaise Sharmaji ke bete ko samjha rahe ho.",
    "Ratta-fication is temporary, concept-clarification is permanent.",
    "Exam mein yeh yaad aa gaya toh party meri taraf se.",
    "Tension-tension go away, come again after the exam day!",
    "Notes itne acche hain ki padosi bhi photocopy maangega.",
    "Pro-tip: Yeh notes padhne se backbencher bhi topper ban sakta hai (shayad).",
    "Ab toh exam phod ke hi aana hai!",
    "Zindagi mein bas 2 cheezein important hai: ek yeh notes, doosra... woh bhi padhai hi hai."
];

function getRandomHinglishQuote(): string {
    const randomIndex = Math.floor(Math.random() * HINGLISH_QUOTES.length);
    return HINGLISH_QUOTES[randomIndex];
}

// --- Event Listeners ---

window.addEventListener('scroll', () => {
    if (window.scrollY > 10) {
        appHeader.classList.add('scrolled');
    } else {
        appHeader.classList.remove('scrolled');
    }
});

fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files ? fileInput.files[0] : null;
    const fileUploadLabel = document.querySelector('.file-upload-label span');
    if (selectedFile) {
        if(fileUploadLabel) fileUploadLabel.textContent = selectedFile.name;
        fileNameDisplay.textContent = `File ready: ${selectedFile.name}`;
    } else {
        if(fileUploadLabel) fileUploadLabel.textContent = 'Choose a file...';
        fileNameDisplay.textContent = '';
    }
});

generateBtn.addEventListener('click', generateNotes);
copyBtn.addEventListener('click', copyToClipboard);
exportPdfBtn.addEventListener('click', exportAsPdf);
exportDocxBtn.addEventListener('click', exportAsDocx);
exportTxtBtn.addEventListener('click', exportAsTxt);

// Author Modal Listeners
authorBtn.addEventListener('click', () => {
    authorModal.classList.remove('hidden');
});

modalCloseBtn.addEventListener('click', () => {
    authorModal.classList.add('hidden');
});

authorModal.addEventListener('click', (event) => {
    // Close if the overlay (the modal itself) is clicked, but not its content
    if (event.target === authorModal) {
        authorModal.classList.add('hidden');
    }
});


// --- Main Generation Logic ---

async function generateNotes() {
    const topic = topicInput.value.trim();
    const url = urlInput.value.trim();
    if (!topic && !selectedFile && !url) {
        alert('Please provide a topic, URL, or upload an image.');
        return;
    }
    
    // Make the output panel visible before showing the loader
    outputPanelWrapper.classList.remove('hidden');

    setLoading(true);
    generatedData = null; // Clear previous data

    try {
        const academicLevel = academicLevelSelect.value;
        
        const systemInstruction = `You are an expert academic tutor. Your task is to generate well-structured, easy-to-understand study notes based on the user's input. The notes should be tailored for a '${academicLevel}' student.
        
        CRUCIAL: You must respond in the same language as the user's prompt (e.g., if the topic is in Hindi, respond in Hindi).
        
        IMPORTANT: Prioritize the user's input in this order:
        1.  If an IMAGE is provided, use its content as the primary source.
        2.  If no image is provided but a URL is, act as if you can access the content of the URL (like an article text or a video's transcript) and use that as the primary source.
        3.  If neither of the above is present, use the provided TEXT TOPIC.

        The output MUST be a JSON object that strictly follows this schema:
        - "title": A concise, relevant title for the notes.
        - "notes": An array of objects, where each object has a "heading" (string) and "points" (array of strings).
        - "keyTerms": An array of objects, each with a "term" (string) and its "definition" (string).
        - "quiz": An array of objects for a multiple-choice quiz, each with a "question" (string), "options" (array of strings), and "answer" (string - the correct option text).`;

        let userPromptText = "Generate study notes based on the following context:\n";
        if (topic) {
            userPromptText += `- Topic: "${topic}"\n`;
        }
        if (url) {
            userPromptText += `- URL: ${url}\n`;
        }
        if (!topic && !url && !selectedFile) {
             // This case is caught by the initial validation, but as a fallback.
            userPromptText = "Generate general notes on a popular academic subject."
        }
        if (selectedFile) {
             // If there's a file, the main instruction is to use it.
            userPromptText = "Generate detailed study notes based on the content of the provided image. Use any provided text or URL as additional guiding context.";
        }

        const contents: any = [{ role: 'user', parts: [] }];
        contents[0].parts.push({ text: userPromptText });

        // Add image part if available
        if (selectedFile) {
            const base64Image = await fileToBase64(selectedFile);
            contents[0].parts.push({
                inlineData: {
                    mimeType: selectedFile.type,
                    data: base64Image,
                },
            });
        }
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        notes: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    heading: { type: Type.STRING },
                                    points: { type: Type.ARRAY, items: { type: Type.STRING } },
                                },
                            },
                        },
                        keyTerms: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    term: { type: Type.STRING },
                                    definition: { type: Type.STRING },
                                },
                            },
                        },
                        quiz: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    question: { type: Type.STRING },
                                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    answer: { type: Type.STRING },
                                },
                            },
                        },
                    },
                },
            },
        });
        
        generatedData = JSON.parse(response.text);
        renderOutput(generatedData);

    } catch (error) {
        console.error('Error generating notes:', error);
        outputContainer.innerHTML = `<div class="error"><p>Sorry, an error occurred while generating notes. Please check the console for details and try again.</p></div>`;
    } finally {
        setLoading(false);
    }
}

function setLoading(isLoading: boolean) {
    generateBtn.disabled = isLoading;
    loadingIndicator.classList.toggle('hidden', !isLoading);
    outputActions.classList.add('hidden'); // Always hide actions on new generation
    if (isLoading) {
        // Clear previous content before showing the loading spinner
        outputContainer.innerHTML = '';
    }
}

// --- Rendering and Utility Functions ---

function renderOutput(data: any) {
    if(!data || !data.title) {
        outputContainer.innerHTML = `<div class="error"><p>The AI returned an invalid response. Please try refining your topic or using a different image.</p></div>`;
        return;
    }
    const randomQuote = getRandomHinglishQuote();
    outputContainer.innerHTML = `
        <article class="notes-content">
            <h1>${data.title || 'Generated Notes'}</h1>

            <section id="main-notes">
                ${data.notes.map((section: any) => `
                    <h2>${section.heading}</h2>
                    <ul>
                        ${section.points.map((point: string) => `<li>${point}</li>`).join('')}
                    </ul>
                `).join('')}
            </section>

            <section id="key-terms">
                <h2>Key Terms</h2>
                ${data.keyTerms.map((item: any) => `
                    <p><strong>${item.term}:</strong> ${item.definition}</p>
                `).join('')}
            </section>

            <section id="quiz">
                <h2>Quiz</h2>
                ${data.quiz.map((q: any, index: number) => `
                    <div class="quiz-question">
                        <p><strong>${index + 1}. ${q.question}</strong></p>
                        <ul>
                            ${q.options.map((opt: string) => `<li>${opt}</li>`).join('')}
                        </ul>
                        <p class="quiz-answer"><em>Answer: ${q.answer}</em></p>
                    </div>
                `).join('')}
            </section>
            
            <footer class="notes-footer">
                <p class="hinglish-quote">"${randomQuote}"</p>
                <p class="tagline">Your academic journey, supercharged.</p>
                <p>// Generated by StudyNote.AI</p>
            </footer>
        </article>
    `;
    outputActions.classList.remove('hidden');
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = (reader.result as string).split(',')[1];
            resolve(result);
        };
        reader.onerror = (error) => reject(error);
    });
}

function copyToClipboard() {
    if (!generatedData) return;
    // Create a cleaner text version for copying
    let textContent = `Title: ${generatedData.title}\n\n`;
    generatedData.notes.forEach((section: any) => {
        textContent += `## ${section.heading}\n`;
        section.points.forEach((point: string) => { textContent += `- ${point}\n`; });
        textContent += '\n';
    });
    textContent += `## Key Terms\n`;
    generatedData.keyTerms.forEach((item: any) => { textContent += `${item.term}: ${item.definition}\n`; });
    textContent += '\n';
    textContent += `## Quiz\n`;
    generatedData.quiz.forEach((q: any, index: number) => {
        textContent += `${index + 1}. ${q.question}\n`;
        q.options.forEach((opt: string) => { textContent += `  - ${opt}\n`; });
        textContent += `   Answer: ${q.answer}\n\n`;
    });

    navigator.clipboard.writeText(textContent).then(() => {
        alert('Notes copied to clipboard!');
    }, (err) => {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy notes.');
    });
}

function triggerDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- Export Functions ---

async function exportAsPdf() {
    const content = outputContainer.querySelector('.notes-content') as HTMLElement;
    if (!content) return;
    
    // Temporarily hide quiz answers for the PDF
    const answers = content.querySelectorAll('.quiz-answer');
    answers.forEach(a => a.classList.add('hidden-for-pdf'));
    
    try {
        const canvas = await html2canvas(content, { 
            scale: 2, 
            useCORS: true,
            backgroundColor: null, // Use transparent background for canvas
        });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgProps = pdf.getImageProperties(imgData);
        const imgRatio = imgProps.width / imgProps.height;
        
        let imgHeight = pdfWidth / imgRatio;
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft > 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
            heightLeft -= pdfHeight;
        }

        pdf.save('StudyNote.AI-Notes.pdf');

    } catch (error) {
        console.error("Error generating PDF:", error);
        alert("Could not generate PDF.");
    } finally {
        // Restore visibility of answers
        answers.forEach(a => a.classList.remove('hidden-for-pdf'));
    }
}

async function exportAsDocx() {
    if (!generatedData) {
        alert("Please generate notes before exporting.");
        return;
    }

    try {
        const quoteElement = outputContainer.querySelector('.hinglish-quote');
        const quote = quoteElement ? quoteElement.textContent || '' : '';

        const doc = new Document({
            styles: {
                paragraphStyles: [
                    {
                        id: 'aside',
                        name: 'Aside',
                        basedOn: 'Normal',
                        next: 'Normal',
                        run: {
                            color: '777777',
                            italics: true,
                        },
                        paragraph: {
                            spacing: { before: 200, after: 200 },
                            alignment: AlignmentType.CENTER
                        }
                    }
                ]
            },
            sections: [{
                children: [
                    new Paragraph({ text: generatedData.title, heading: HeadingLevel.TITLE }),
                    
                    ...generatedData.notes.flatMap((section: any) => [
                        new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_2 }),
                        ...section.points.map((point: string) => new Paragraph({ text: point, bullet: { level: 0 } })),
                        new Paragraph({ text: "" }), // spacing
                    ]),

                    new Paragraph({ text: "Key Terms", heading: HeadingLevel.HEADING_2 }),
                    ...generatedData.keyTerms.map((item: any) => new Paragraph({
                        children: [
                            new TextRun({ text: `${item.term}: `, bold: true }),
                            new TextRun(item.definition),
                        ],
                    })),
                    new Paragraph({ text: "" }), // spacing

                    new Paragraph({ text: "Quiz", heading: HeadingLevel.HEADING_2 }),
                     ...generatedData.quiz.flatMap((q: any, index: number) => [
                        new Paragraph({ text: `${index + 1}. ${q.question}` }),
                         ...q.options.map((opt: string) => new Paragraph({ text: `- ${opt}`, style: "ListParagraph" })),
                         new Paragraph({
                             children: [
                                 new TextRun({ text: "Answer: ", italics: true }),
                                 new TextRun({ text: q.answer, italics: true }),
                             ],
                         }),
                         new Paragraph({ text: "" }), // spacing
                    ]),
                     new Paragraph({
                        children: [
                            new TextRun({ text: quote, italics: true, color: "7C3AED" }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 400 },
                    }),
                    new Paragraph({
                        text: "Your academic journey, supercharged. // Generated by StudyNote.AI",
                        style: "aside"
                    }),
                ],
            }],
        });

        const blob = await Packer.toBlob(doc);
        triggerDownload(blob, 'StudyNote.AI-Notes.docx');
    } catch (error) {
        console.error("Error generating DOCX:", error);
        alert("Could not generate DOCX file.");
    }
}

function exportAsTxt() {
    if (!generatedData) {
        alert("Please generate notes before exporting.");
        return;
    }
    try {
        const quoteElement = outputContainer.querySelector('.hinglish-quote');
        const quote = quoteElement ? quoteElement.textContent || '' : '';

        // Create a cleaner text version
        let textContent = `Title: ${generatedData.title}\n\n`;
        
        generatedData.notes.forEach((section: any) => {
            textContent += `## ${section.heading}\n`;
            section.points.forEach((point: string) => {
                textContent += `- ${point}\n`;
            });
            textContent += '\n';
        });

        textContent += `## Key Terms\n`;
        generatedData.keyTerms.forEach((item: any) => {
            textContent += `${item.term}: ${item.definition}\n`;
        });
        textContent += '\n';

        textContent += `## Quiz\n`;
        generatedData.quiz.forEach((q: any, index: number) => {
            textContent += `${index + 1}. ${q.question}\n`;
            q.options.forEach((opt: string) => {
                textContent += `  - ${opt}\n`;
            });
            textContent += `   Answer: ${q.answer}\n\n`;
        });
        
        textContent += `\n\n---\n${quote}\nYour academic journey, supercharged. // Generated by StudyNote.AI\n`;
        
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        triggerDownload(blob, 'StudyNote.AI-Notes.txt');
    } catch(error) {
        console.error("Error generating TXT:", error);
        alert("Could not generate TXT file.");
    }
}