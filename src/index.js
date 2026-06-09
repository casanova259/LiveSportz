import express from 'express';

const app=express();
const port=8000;

app.use(express.json());

app.get('/',(req,res)=>{
    res.send('Hello from Express Server')
})

app.listen(port,()=>{
    console.log(`Server is Running at http://localhost:${port}`)
})