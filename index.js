const express = require('express');
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser')
const app = express();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xgaxesu.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const verifyToken = async (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: "unAuthorized Access", status: 401 })
    };
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: "unAuthorized Access", status: 401 });
        }

        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const districtCollection = client.db('lifeFlowDB').collection('districts');
        const upazilaCollection = client.db('lifeFlowDB').collection('upazilas');
        const userCollection = client.db('lifeFlowDB').collection('users');
        const requestCollection = client.db('lifeFlowDB').collection('requests');
        const blogCollection = client.db('lifeFlowDB').collection('blogs');
        const paymentCollection = client.db('lifeFlowDB').collection('payments');

        // verify the user is admin or not
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === "admin";
            if (!isAdmin) {
                return res.status(403).send({ message: 'Forbidden access', status: 403 })
            }

            next()
        }


        // auth related api
        app.post("/jwt", async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "24h" });
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
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            let query = {};

            if (req.query.sort === 'blocked' || req.query.sort === 'active') {
                query.status = req.query.sort;
            }

            if (req.query.sort === 'all') {
                query = {}
            }

            const result = await userCollection.find(query).toArray();
            res.send(result);
        })

        // GET role of users
        app.get('/users/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const result = await userCollection.findOne({ email });
            res.send(result);
        })

        // GET user status api
        app.get('/userStatus/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const result = await userCollection.findOne(query);
            res.send(result)
        })

        app.get('/searchUser', verifyToken, async (req, res) => {
            let query = {};

            if (req.query.donor) {
                query.role = req.query.donor
            }

            if (req.query.email) {
                query.email = req.query.email
            }
            if (req.query.bloodType) {
                query.bloodType = req.query.bloodType
            }
            if (req.query.district) {
                query.district = req.query.district
            }
            if (req.query.upazila) {
                query.email = req.query.upazila
            }

            const result = await userCollection.find(query).toArray();
            res.send(result);
        })

        app.put('/users/:email', verifyToken, async (req, res) => {
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

        app.patch("/users/:email", verifyToken, async (req, res) => {
            const user = req.body;
            const email = req.params.email
            const filter = { email: email };
            const updatedDoc = {
                $set: {
                    name: user.name,
                    email: user?.email,
                    district: user?.district,
                    upazila: user?.upazila,
                    bloodType: user?.bloodType,
                    image: user?.image
                }
            }

            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })

        app.patch("/blockUser/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: "blocked"
                }
            }

            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })

        app.patch("/activeUser/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: "active"
                }
            }

            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })

        app.patch("/changeRole/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const userRole = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: userRole?.role
                }
            }

            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })

        // request related api
        app.get('/requests', async (req, res) => {
            const result = await requestCollection.find().toArray();
            res.send(result);
        })

        app.get('/requests/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };

            const user = await userCollection.findOne(query);

            if (user?.role === 'admin' || user?.role === 'volunteer') {
                const dataPerPage = 10;
                const page = req.query.page;

                const requests = await requestCollection
                    .find()
                    .skip(page * dataPerPage)
                    .limit(dataPerPage)
                    .toArray()

                return res.send(requests);
            }

            const result = await requestCollection.find(query).toArray();
            res.send(result);
        })

        app.get('/request/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await requestCollection.findOne(query)
            res.send(result)
        })

        // GET all pending requests
        app.get('/pendingRequests', verifyToken, async (req, res) => {
            let query = {};
            if (req.query.pending) {
                query = {
                    status: req.query.pending
                }
            }
            const result = await requestCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/requests', verifyToken, async (req, res) => {
            const request = req.body;
            const result = await requestCollection.insertOne(request);
            res.send(result);
        })

        app.patch('/requests/:id', verifyToken, async (req, res) => {
            const request = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    ...request
                }
            }
            const result = await requestCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })

        // Change a request status from pending to inprogress
        app.patch('/requestStatusChange/:id', verifyToken, async (req, res) => {
            const request = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: request.status
                }
            }
            const result = await requestCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })

        app.delete('/requests/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await requestCollection.deleteOne(query);
            res.send(result);
        })

        // GET requests count api
        app.get('/requestsCount', async (req, res) => {
            const count = await requestCollection.estimatedDocumentCount();
            res.send({ count })
        })

        // Blog related apis
        app.get('/blogs', verifyToken, async (req, res) => {
            let query = {}

            if (req.query.sort) {
                query = {
                    status: req.query.sort
                }
            }

            if (req.query.sort === "all") {
                query = {}
            }

            if (req.query.status) {
                query = {
                    status: req.query.status
                }
            }

            if (req.query.search) {
                query.$or = [
                    { title: { $regex: new RegExp(req.query.search, "i") } },
                    { name: { $regex: new RegExp(req.query.search, "i") } }
                ];
            }

            const result = await blogCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/blogs', verifyToken, async (req, res) => {
            const blog = req.body;
            const result = await blogCollection.insertOne(blog);
            res.send(result);
        })

        app.patch('/blogs/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const updateStatus = req.body;
            const filter = { _id: new ObjectId(id) };
            const date = new Date();
            const month = date.toLocaleString('default', { month: 'short' })
            const day = date.getDate();

            if (updateStatus.status === 'published') {
                const updatedDoc = {
                    $set: {
                        status: updateStatus.status,
                        published_date: `${month}/${day}`
                    }
                }
                const result = await blogCollection.updateOne(filter, updatedDoc);
                return res.send(result);
            } else {
                const updatedDoc = {
                    $set: {
                        status: updateStatus.status,
                        published_date: ''
                    }
                }
                const result = await blogCollection.updateOne(filter, updatedDoc);
                res.send(result);
            }
        })

        app.delete(`/blogs/:id`, verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await blogCollection.deleteOne(query);
            res.send(result);
        })

        app.get("/allStats", verifyToken, async (req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const requests = await requestCollection.estimatedDocumentCount();
            const amounts = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: { $toDouble: "$amount" } }
                    }
                }
            ]).toArray()
            console.log(amounts);
            const totalAmount = amounts.length > 0 ? amounts[0]?.totalAmount : 0;
            res.send({ users, requests, totalAmount })
        })

        // payment intent related api
        app.post('/create-payment-intent', async (req, res) => {
            const { paymentAmount } = req.body;
            const amount = parseInt(paymentAmount * 100);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: [
                    'card'
                ]
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })

        app.get('/payments', async (req, res) => {
            const result = await paymentCollection.find().toArray();
            res.send(result);
        })

        app.post('/payments', async (req, res) => {
            const paymentInfo = req.body;
            const result = await paymentCollection.insertOne(paymentInfo)
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