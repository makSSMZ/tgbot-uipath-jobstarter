import fetch from 'node-fetch';

class HTTPResponseError extends Error {
    constructor(response) {
        super(`HTTP Error Response: ${response.status} ${response.statusText}`);
        this.response = response;
    }
}

//Function to check user is active export
export async function checkUserIsActive(userId) {

    const body = {
        telegram_id: userId
    }

    const response = await fetch(`${process.env.inspectorUrl}/api/check/`, {
        method: 'post',
        body: JSON.stringify(body),
        headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Token ' + process.env.inspectorToken
        }
    });
    const data = await response.json();

    console.log(`User ${userId} is active: ${data.active}`);

    return data.active;

};