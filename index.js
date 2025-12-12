const express = require('express')
require('dotenv').config()
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.PAYMENT_SECRET);
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

// traking id generator 
function createTrackingId() {
  const prefix = 'BDX-';
  const timestampPart = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(16).substring(2, 8).toUpperCase();
  return `${prefix}${timestampPart}-${randomPart}`;
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db('styleDecor')
    const packagesCollection = db.collection('packages')
    const bookingCollection = db.collection('booking')
    const paymentCollection = db.collection('payment')

    // package releted apis 
    app.get('/packages', async (req, res) => {
      const search = req.query.search
      const type = req.query.type
      let limit = parseInt(req.query.limit)
      const min = parseInt(req.query.min)
      const max = parseInt(req.query.max)
      const query = {}
      if (search) {
        const searchValue = search.toLocaleLowerCase()
        query.service_name = { $regex: searchValue, $options: "i" }
      }
      if (type) {
        query.service_category = { $regex: type, $options: "i" }
      }
      if (min, max) {
        query.cost = { $gte: min, $lte: max }
      }
      const result = await packagesCollection.find(query).limit(limit ? limit : 0).toArray()
      res.send(result)
    })

    app.get('/package/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await packagesCollection.findOne(query)
      res.send(result)
    })
    app.post('/package',async(req,res)=>{
      const newPackage = req.body
      const result = await packagesCollection.insertOne(newPackage)
      res.send(result)
    })
    // payment releted apis 
    app.get('/my-payment-history',async(req,res)=>{
      const email = req.query.email
      const query ={}
      if(!email){
        return res.send({message:"requer email to work"})
      }
      query.payer_email=email
      const result = await paymentCollection.find(query).toArray()
      res.send(result)
    })
    app.post('/payment-checkout-session', async (req, res) => {
      const packageInfo = req.body
      const { email, bookingId, name, image, cost, trakingId, packageId } = packageInfo
      const amount = parseInt(cost)
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: 'bdt',
              product_data: { name, images: [image] },
              unit_amount: amount * 100
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        customer_email: email,
        metadata: {
          bookingId,
          trakingId,
          packageId,
          service_name:name
        },
        success_url: `${process.env.YOUR_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.YOUR_DOMAIN}/dashboard/my-bookings`,
      })
      res.send(session.url)
    })

    app.patch('/payment-success', async (req, res) => {
      const { session_id } = req.query
      const sessonData = await stripe.checkout.sessions.retrieve(session_id)
      console.log(sessonData)

      // check the booking first 
      const query = { transactionId: sessonData.payment_intent }
      const bookingExsit = await paymentCollection.findOne(query)
      if (bookingExsit) {
        return res.send({
          message: "Payment already complite for this booking",
          transactionId: sessonData.payment_intent,
          trakingId: bookingExsit.trakingId,
        })
      }

      // modify the booking 
      const id = sessonData.metadata.bookingId
      const trakingId = sessonData.metadata.trakingId;
      const filter = {_id: new ObjectId(id) }
      const update = {
        $set: {
          paymentStatus: sessonData.payment_status,
          trakingId,
          transactionId: sessonData.payment_intent,
          serviceStatus: "pending"
        }
      }
      const modifyResult = await bookingCollection.updateOne(filter, update)

      // create a transaciton history 
      const paymentInfo = {
        amount: sessonData.amount_total,
        currency: sessonData.currency,
        payer_email: sessonData.customer_email,
        packageId: sessonData.metadata.packageId,
        service_name: sessonData.metadata.service_name,
        bookingId: sessonData.metadata.bookingId,
        transactionId: sessonData.payment_intent,
        paymentStatus: sessonData.payment_status,
        payAt: new Date(),
        trakingId
      }
      const paymentResult = await paymentCollection.insertOne(paymentInfo)
      res.send({
        message: "success",
        paymentResult,
        transactionId: sessonData.payment_intent,
        trakingId,
        modifyResult
      })
    })

    // booking releted apis 
    app.get('/dashboard/my-bookings', async (req, res) => {
      const email = req.query.email
      const query = {}
      if (email) {
        query.userEmail = email
      }
      const result = await bookingCollection.find(query).toArray()
      res.send(result)
    })
    app.get('/booking/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await bookingCollection.findOne(query)
      res.send(result)
    })
    app.post('/package', async (req, res) => {
      const newPackage = req.body
      const trakingId = createTrackingId()
      newPackage.trakingId = trakingId
      const result = await bookingCollection.insertOne(newPackage)
      res.send(result)
    })
    app.delete('/package/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await bookingCollection.deleteOne(query)
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
