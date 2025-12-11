const express = require('express')
require('dotenv').config()
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 3000


// middleware 
app.use(express.json())
app.use(cors())
app.get('/', (req, res) => {
  res.send('styleDecor start !')
})

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wfr9cox.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db('styleDecor')
    const packagesCollection = db.collection('packages')
    const bookingCollection = db.collection('booking')

    // package releted apis 
    app.get('/packages',async(req,res)=>{
        const search = req.query.search
        const type = req.query.type
        let limit = parseInt(req.query.limit)
        const min = parseInt(req.query.min)
        const max = parseInt(req.query.max)
        const query = {}
        if(search){
            const searchValue = search.toLocaleLowerCase()
            query.service_name={$regex:searchValue,$options:"i"}
        }
        if(type){
            query.service_category={$regex:type,$options:"i"}
        }
        if(min,max){
            query.cost = {$gte:min,$lte:max}
        }
        const result = await packagesCollection.find(query).limit(limit?limit: 0).toArray()
        res.send(result)
    })

    app.get('/package/:id',async(req,res)=>{
        const id = req.params.id
        const query = {_id:new ObjectId(id)}
        const result = await packagesCollection.findOne(query)
        res.send(result)
    })
    app.post('/package',async(req,res)=>{
        const newPackage = req.body
        const result = await bookingCollection.insertOne(newPackage)
        res.send(result)
    })
    app.delete('/package/:id',async(req,res)=>{
       const id = req.params.id
        const query = {_id:new ObjectId(id)}
        const result = await bookingCollection.deleteOne(query)
        res.send(result)
    })
    // booking releted apis 
    app.get('/dashboard/my-bookings',async(req,res)=>{
      const email = req.query.email
      const query ={}
      if(email){
        query.userEmail=email
      }
      const result = await bookingCollection.find(query).toArray()
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
