const owner = process.env.OWNER_EMAIL?.trim();
console.log(JSON.stringify({ ownerConfigured: !!owner }));
