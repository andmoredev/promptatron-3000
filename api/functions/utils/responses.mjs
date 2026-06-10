const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.ORIGIN || '*',
};

export const formatResponse = (statusCode, body) => {
  return {
    statusCode,
    body: typeof body === 'string' ? JSON.stringify({ message: body }) : JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  };
};

export const formatEmptyResponse = () => {
  return {
    statusCode: 204,
    headers: corsHeaders
  };
};
