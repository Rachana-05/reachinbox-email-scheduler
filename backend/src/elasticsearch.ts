import { Client } from "@elastic/elasticsearch";
import dotenv from "dotenv";

dotenv.config();

export const elasticsearchClient = new Client({
  node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
});

const INDEX_NAME = "emails";

export const initializeElasticsearch = async () => {
  try {
    const exists = await elasticsearchClient.indices.exists({
      index: INDEX_NAME,
    });

    if (!exists) {
      await elasticsearchClient.indices.create({
        index: INDEX_NAME,
        mappings: {
          properties: {
            id: { type: "keyword" },
            campaign_id: { type: "keyword" },
            sender_id: { type: "keyword" },
            recipient: { type: "keyword" },
            subject: { type: "text" },
            body: { type: "text" },
            scheduled_at: { type: "date" },
            sent_at: { type: "date" },
            status: { type: "keyword" },
            created_at: { type: "date" },
            updated_at: { type: "date" },
          },
        },
      });

      console.log("✅ Elasticsearch index created");
    } else {
      console.log("✅ Elasticsearch index already exists");
    }
  } catch (error) {
    console.error("❌ Elasticsearch initialization failed:", error);
    throw error;
  }
};

export const indexEmail = async (email: any) => {
  try {
    await elasticsearchClient.index({
      index: INDEX_NAME,
      id: email.id,
      document: {
        id: email.id,
        campaign_id: email.campaign_id,
        sender_id: email.sender_id,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
        scheduled_at: email.scheduled_at,
        sent_at: email.sent_at,
        status: email.status,
        created_at: email.created_at,
        updated_at: email.updated_at,
      },
    });

    console.log(`🔎 Email indexed in Elasticsearch: ${email.id}`);
  } catch (error) {
    console.error(
      `❌ Failed to index email ${email.id}:`,
      error
    );
  }
};

export const searchEmails = async (query: string) => {
  const result = await elasticsearchClient.search({
    index: INDEX_NAME,
    query: {
      multi_match: {
        query,
        fields: [
          "subject",
          "body",
          "recipient",
        ],
      },
    },
  });

  return result.hits.hits.map((hit) => hit._source);
};