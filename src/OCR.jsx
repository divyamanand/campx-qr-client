import React, { useState } from 'react'
import { createWorker } from 'tesseract.js'
import { PDFToImage } from './PDFToImage'

const OCR = () => {
    const [text, setText] = useState("")
    const [isProcessing, setIsProcessing] = useState(false)
    const [progress, setProgress] = useState("")

    const handleChange = async (e) => {
       const files = Array.from(e.target.files || [])
       if (files.length === 0) return

       setIsProcessing(true)
       const results = []
       
       try {
           const worker = await createWorker("eng")
           const pdfToImage = new PDFToImage()
           
           // Process each PDF in the array
           for (const file of files) {
               setProgress(`Processing ${file.name}...`)
               
               // Load PDF document
               const pdf = await pdfToImage.loadDocument(file)
               const totalPages = pdf.numPages
               
               // Process each page
               for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                   setProgress(`Processing ${file.name} - Page ${pageNum}/${totalPages}`)
                   
                   const page = await pdf.getPage(pageNum)
                   const imageResult = await pdfToImage.convertPageToImage(page, 2)
                   
                   // Run OCR on the page image
                   const ret = await worker.recognize(imageResult.blob)
                   
                   results.push({
                       fileName: file.name,
                       pageNo: pageNum,
                       text: ret.data.text
                   })
               }
           }
           
           // Combine all results organized by filename and page number
           const combinedText = results
               .map(r => `${r.fileName} - Page ${r.pageNo}:\n${r.text}`)
               .join('\n\n---\n\n')
           
           setText(combinedText)
           await worker.terminate()
       } catch (error) {
           console.error("OCR Error:", error)
           setText(`Error: ${error.message}`)
       } finally {
           setIsProcessing(false)
           setProgress("")
       }
    }

  return (
    <>
        <input 
            onChange={handleChange} 
            type='file'
            multiple
            accept="application/pdf"
            disabled={isProcessing}
        />
        {isProcessing && (
            <div>
                <div>Processing PDFs...</div>
                {progress && <div style={{fontSize: '0.9rem', color: '#666'}}>{progress}</div>}
            </div>
        )}
        {text && <div style={{whiteSpace: 'pre-wrap', marginTop: '1rem'}}>{text}</div>}
    </>
  )
}

export default OCR