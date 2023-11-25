const express = require('express');
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser')
const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xgaxesu.mongodb.net/?retryWrites=true&w=majority`;

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
        // await client.connect();

        const districtCollection = client.db('lifeFlowDB').collection('districts');
        const upazilaCollection = client.db('lifeFlowDB').collection('upazilas');
        const userCollection = client.db('lifeFlowDB').collection('users');
        const requestCollection = client.db('lifeFlowDB').collection('requests');


        // auth related api
        app.post("/jwt", async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.TOKEN_ACCESS_SECRET, { expiresIn: "365d" });
            console.log(token);
            res
                .cookie("token", token, {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'none',
                })
                .send({ success: true });
        });

        app.get('/logout', async (req, res) => {
            try {
                res
                    .clearCookie('token', { maxAge: 0 })
                    .send({ success: true })
            } catch (err) {
                res.status(500).send(err)
            }
        })

        // districts related api
        app.get('/districts', async (req, res) => {
            const result = await districtCollection.find().toArray();
            res.send(result);
        });

        // upazilas related api
        app.get('/upazilas', async (req, res) => {
            const result = await upazilaCollection.find().toArray();
            res.send(result)
        });

        app.get('/upazilas/:name', async (req, res) => {
            const name = req.params.name;
            const district = await districtCollection.findOne({ name })

            let query = {}
            if (district) {
                query = { district_id: district.district_id }
            }

            const result = await upazilaCollection.find(query).toArray();
            res.send(result);
        })

        // Users related api
        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        // GET role of users
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const result = await userCollection.findOne({ email });
            res.send(result);
        })

        app.put('/users/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body;
            const query = { email: email }
            const options = { upsert: true }
            // checking the user if exist or not
            const isExist = await userCollection.findOne(query);
            console.log("Found User is ----->", isExist);

            if (isExist) {
                return res.send(isExist)
            }

            // updating documents
            const updateDoc = {
                $set: {
                    ...user
                }
            }

            const result = await userCollection.updateOne(query, updateDoc, options)
            res.send(result);
        })

        // request related api
        app.get('/requests', async (req, res) => {
            const result = await requestCollection.find().toArray();
            res.send(result);
        })

        app.get('/requests/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await requestCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/requests', async (req, res) => {
            const request = req.body;
            const result = await requestCollection.insertOne(request);
            res.send(result);
        })


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('Blood is flowing.')
});

app.listen(port, () => {
    console.log(`Blood is flowing on port: ${port}`)
});